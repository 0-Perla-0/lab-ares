import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  S3Client,
  CreateBucketCommand,
  PutBucketVersioningCommand,
} from "@aws-sdk/client-s3";
import { PrismaService } from "../../src/database/prisma.service";
import { AuditService } from "../../src/auth/audit.service";
import {
  ObjectDeletionService,
  type DeletionPurpose,
} from "../../src/storage/object-deletion.service";
import { S3Storage } from "../../src/storage/s3.storage";
import { StorageService } from "../../src/storage/storage.service";
import { RetentionService } from "../../src/retention/retention.service";
import { NotificationsService } from "../../src/notifications/notifications.service";
import { withWorkerWriteBarrier } from "../../src/common/domain/worker-write-barrier";
import { ApiException } from "../../src/common/errors/api.exception";
import { suppressOperationalEvidence } from "../../src/retention/operational-evidence";
import { operationFingerprint } from "../../src/common/domain/canonical-operation";
import type { ObjectVersion } from "../../src/storage/storage.types";

const url = process.env.DATABASE_URL;
if (!url || !/_(test|ci)$/.test(new URL(url).pathname))
  throw new Error("Object deletion acceptance requires isolated _test/_ci DB");
const config = new ConfigService({
  DATABASE_URL: url,
  SUPPRESSION_JOURNAL_KEY_VERSION: "deletion-v1",
  SUPPRESSION_JOURNAL_HMAC_SECRET:
    "deletion-acceptance-only-key-not-for-production-2026",
  RETENTION_INSTITUTIONAL_POLICIES_APPROVED: false,
  RETENTION_LEASE_MS: 120000,
  RETENTION_MAX_ATTEMPTS: 1,
  RETENTION_RETRY_BASE_MS: 1000,
  RETENTION_BATCH_SIZE: 10,
});
const db = new PrismaService(config),
  replica = new PrismaService(config),
  audit = new AuditService(db);
const endpoint = process.env.ARES_TEST_DELETION_S3_ENDPOINT;
if (
  endpoint &&
  (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint) ||
    !/^\/ares_object_deletion_(test|ci)$/.test(new URL(url).pathname))
)
  throw new Error(
    "Real deletion uses dedicated local object-deletion DB and newly created test buckets only",
  );
let admin: any, rule: any;
const key = () => `deletion-${randomUUID()}`;
function memoryStorage() {
  const objects = new Map<string, ObjectVersion[]>(),
    manifests = new Map<string, Buffer>();
  const storage: any = {
    deletionNamespace: vi.fn(() => "a".repeat(64)),
    deletionVersions: vi.fn(async (bucket, name) =>
      structuredClone(objects.get(`${bucket}:${name}`) ?? []),
    ),
    deleteVersion: vi.fn(async (bucket, name, id) => {
      objects.set(
        `${bucket}:${name}`,
        (objects.get(`${bucket}:${name}`) ?? []).filter((row) => row.id !== id),
      );
    }),
    putSuppressionJournal: vi.fn(async (name, body) => {
      if (manifests.has(name))
        throw Object.assign(new Error("exists"), {
          name: "PreconditionFailed",
        });
      manifests.set(name, Buffer.from(body));
    }),
    getSuppressionJournal: vi.fn(async (name) =>
      Readable.from([manifests.get(name)!]),
    ),
    listDeletionIntents: vi.fn(async () => ({ keys: [...manifests.keys()] })),
    delete: vi.fn(async () => {
      throw new Error("unversioned DELETE must never be used");
    }),
  };
  return { storage, objects, manifests };
}
async function fileFixture(status: "DISPONIBLE" | "RECHAZADO" = "DISPONIBLE") {
  const id = randomUUID().replaceAll("-", "").slice(0, 30),
    h = memoryStorage();
  const objectKey =
    status === "DISPONIBLE"
      ? `reports/deletion-${id}/synthetic.csv`
      : `synthetic/${id}/rejected.pdf`;
  const file = await db.archivo.create({
    data: {
      id,
      propietarioId: admin.id,
      objectKey,
      quarantineKey: `synthetic/q/${id}`,
      originalName: "Synthetic private fixture",
      detectedMime: status === "DISPONIBLE" ? "text/csv" : "application/pdf",
      sizeBytes: 3,
      status,
    },
  });
  h.objects.set(`available:${objectKey}`, [
    { id: "v1", etag: '"synthetic-etag"', deleteMarker: false },
  ]);
  const purpose: DeletionPurpose =
    status === "DISPONIBLE" ? "GENERATED_REPORT" : "REJECTED_FILE";
  const deletion = new ObjectDeletionService(
    db,
    h.storage,
    config as any,
    audit,
  );
  return { ...h, file, purpose, deletion };
}
const retention = (
  storage: any = {},
  deletions?: ObjectDeletionService,
  centralAudit: any = audit,
) =>
  new RetentionService(
    db,
    centralAudit,
    new NotificationsService(db),
    config as any,
    new StorageService(db, storage, {} as any, config as any, deletions),
    storage,
    deletions,
  );

describe("durable object deletion on MariaDB (versioned transport simulated unless opt-in)", () => {
  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    admin = await db.usuario.create({
      data: {
        codigo: `deletion-admin-${suffix}`,
        email: `deletion-admin-${suffix}@example.test`,
        rol: "ADMIN",
        estado: "ACTIVA",
        passwordHash: "synthetic-non-login",
      },
    });
    const created = await retention().createRule(
      admin,
      {
        categoria: "ARCHIVOS_RECHAZADOS",
        finalidad: "Synthetic isolated deletion protocol acceptance",
        responsable: "Synthetic technical authority",
        eventoInicio: "Synthetic file rejection",
        periodoActivoDias: 0,
        periodoBloqueadoDias: 0,
        accionFinal: "ANONIMIZAR",
        fundamento: "Acceptance fixture only, not institutional policy",
        provisional: true,
        automatica: false,
      },
      key(),
    );
    rule = await retention().approveRule(
      admin,
      created.id,
      "Synthetic provisional approval",
      key(),
    );
  });
  afterAll(async () => {
    await db.$disconnect();
    await replica.$disconnect();
  });
  it("reserves before external I/O and stores no falsely completed receipt", async () => {
    const h = await fileFixture();
    const job = await withWorkerWriteBarrier(db, (tx) =>
      h.deletion.prepare(tx, h.file.id, h.purpose),
    );
    expect(
      (await db.archivo.findUniqueOrThrow({ where: { id: h.file.id } })).status,
    ).toBe("ELIMINACION_PENDIENTE");
    expect(job.state).toBe("PREPARED");
    expect(h.storage.deleteVersion).not.toHaveBeenCalled();
    expect(h.manifests.size).toBe(0);
    expect(
      await db.auditEvent.count({
        where: { action: "OBJECT_DELETION_PREPARED", objectId: job.id },
      }),
    ).toBe(1);
  });
  it("fails closed for unversioned buckets without reserving metadata", async () => {
    const h = await fileFixture();
    h.storage.deletionVersions.mockRejectedValue(
      new ApiException("STORAGE_VERSIONING_REQUIRED", 409),
    );
    await expect(
      withWorkerWriteBarrier(db, (tx) =>
        h.deletion.prepare(tx, h.file.id, h.purpose),
      ),
    ).rejects.toMatchObject({ code: "STORAGE_VERSIONING_REQUIRED" });
    expect(
      await db.objectDeletionJob.count({ where: { fileId: h.file.id } }),
    ).toBe(0);
    expect(
      (await db.archivo.findUniqueOrThrow({ where: { id: h.file.id } })).status,
    ).toBe("DISPONIBLE");
    expect(h.storage.delete).not.toHaveBeenCalled();
  });
  it("DB triggers reject a stale association after reservation and preserve manifest identities", async () => {
    const h = await fileFixture();
    const requirement = await db.requisitoDocumento.create({
      data: {
        usuarioId: admin.id,
        codigo: key(),
        nombre: "Synthetic stale attachment",
      },
    });
    const job = await withWorkerWriteBarrier(db, (tx) =>
      h.deletion.prepare(tx, h.file.id, h.purpose),
    );
    await expect(
      replica.documentoVersion.create({
        data: {
          requisitoId: requirement.id,
          archivoId: h.file.id,
          cargadoPorId: admin.id,
          version: 1,
        },
      }),
    ).rejects.toThrow("FILE_DELETION_RESERVED");
    await expect(
      db.archivo.update({
        where: { id: h.file.id },
        data: { objectKey: "foreign/key" },
      }),
    ).rejects.toThrow("FILE_DELETION_RESERVED");
    await expect(
      db.objectDeletionJob.update({
        where: { id: job.id },
        data: { manifestRef: "foreign/intent" },
      }),
    ).rejects.toThrow("OBJECT_DELETION_IDENTITY_IMMUTABLE");
    expect(h.storage.deleteVersion).not.toHaveBeenCalled();
  });
  it("publishes the immutable intent before the first exact-version DELETE, then verifies", async () => {
    const h = await fileFixture();
    const job = await withWorkerWriteBarrier(db, (tx) =>
      h.deletion.prepare(tx, h.file.id, h.purpose),
    );
    const original = h.storage.deleteVersion.getMockImplementation();
    h.storage.deleteVersion.mockImplementation(async (...args: any[]) => {
      expect(h.manifests.has(job.manifestRef)).toBe(true);
      expect(
        (
          await replica.objectDeletionJob.findUniqueOrThrow({
            where: { id: job.id },
          })
        ).state,
      ).toBe("DISPATCHED");
      await original!(...args);
    });
    await h.deletion.process(job.id);
    expect(
      (await db.objectDeletionJob.findUniqueOrThrow({ where: { id: job.id } }))
        .state,
    ).toBe("VERIFIED");
    expect(
      (await db.archivo.findUniqueOrThrow({ where: { id: h.file.id } })).status,
    ).toBe("ELIMINACION_PENDIENTE");
    await withWorkerWriteBarrier(db, (tx) => h.deletion.complete(tx, job.id));
    expect(
      (await db.archivo.findUniqueOrThrow({ where: { id: h.file.id } })).status,
    ).toBe("ELIMINADO");
    expect(h.storage.delete).not.toHaveBeenCalled();
  });
  it("records a lost DELETE response as uncertain and reconciles by reading without resending", async () => {
    const h = await fileFixture(),
      job = await withWorkerWriteBarrier(db, (tx) =>
        h.deletion.prepare(tx, h.file.id, h.purpose),
      );
    h.storage.deleteVersion.mockImplementation(
      async (bucket: string, name: string) => {
        h.objects.set(`${bucket}:${name}`, []);
        throw new Error("provider accepted but response lost");
      },
    );
    await expect(h.deletion.process(job.id)).rejects.toThrow(
      "provider accepted",
    );
    expect(
      (await db.objectDeletionJob.findUniqueOrThrow({ where: { id: job.id } }))
        .state,
    ).toBe("UNCERTAIN");
    expect(await h.deletion.reconcile(job.id)).toBe("VERIFIED");
    expect(h.storage.deleteVersion).toHaveBeenCalledOnce();
    expect(
      (await db.archivo.findUniqueOrThrow({ where: { id: h.file.id } })).status,
    ).toBe("ELIMINACION_PENDIENTE");
  });
  it("restarts an uncertain delivery using only the remaining sealed versions and identical external intent", async () => {
    const h = await fileFixture(),
      job = await withWorkerWriteBarrier(db, (tx) =>
        h.deletion.prepare(tx, h.file.id, h.purpose),
      );
    h.storage.deleteVersion.mockRejectedValueOnce(
      new Error("timeout before provider reply"),
    );
    await expect(h.deletion.process(job.id)).rejects.toThrow("timeout");
    const bytes = Buffer.from(h.manifests.get(job.manifestRef)!);
    const restarted = new ObjectDeletionService(
      replica,
      h.storage,
      config as any,
      new AuditService(replica),
    );
    await restarted.process(job.id);
    expect(
      (await db.objectDeletionJob.findUniqueOrThrow({ where: { id: job.id } }))
        .state,
    ).toBe("VERIFIED");
    expect(h.manifests.get(job.manifestRef)).toEqual(bytes);
    expect(h.storage.deleteVersion).toHaveBeenCalledTimes(2);
    expect(
      h.storage.deleteVersion.mock.calls.every(
        (call: any[]) => call[2] === "v1",
      ),
    ).toBe(true);
  });
  it("does not dispatch after immutable external intent publication fails or conflicts", async () => {
    const h = await fileFixture(),
      job = await withWorkerWriteBarrier(db, (tx) =>
        h.deletion.prepare(tx, h.file.id, h.purpose),
      );
    h.storage.putSuppressionJournal.mockRejectedValueOnce(
      new Error("manifest publication unavailable"),
    );
    await expect(h.deletion.process(job.id)).rejects.toThrow(
      "publication unavailable",
    );
    expect(h.storage.deleteVersion).not.toHaveBeenCalled();
    expect(
      (await db.objectDeletionJob.findUniqueOrThrow({ where: { id: job.id } }))
        .state,
    ).toBe("PREPARED");
    h.manifests.set(job.manifestRef, Buffer.from("conflicting bytes"));
    await expect(h.deletion.process(job.id)).rejects.toMatchObject({
      code: "OBJECT_DELETION_MANIFEST_CONFLICT",
    });
    expect(h.storage.deleteVersion).not.toHaveBeenCalled();
  });
  it("never revives ownership expired during external I/O to certify a deletion", async () => {
    const h = await fileFixture(),
      job = await withWorkerWriteBarrier(db, (tx) =>
        h.deletion.prepare(tx, h.file.id, h.purpose),
      );
    const original = h.storage.deleteVersion.getMockImplementation();
    h.storage.deleteVersion.mockImplementation(async (...args: any[]) => {
      await original!(...args);
      await replica.objectDeletionJob.update({
        where: { id: job.id },
        data: { leaseUntil: new Date(0) },
      });
    });
    await expect(h.deletion.process(job.id)).rejects.toMatchObject({
      code: "OBJECT_DELETION_LEASE_LOST",
    });
    const current = await db.objectDeletionJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(current.state).toBe("DISPATCHED");
    expect(current.verifiedAt).toBeNull();
    expect(current.leaseUntil).toEqual(new Date(0));
    expect(await h.deletion.reconcile(job.id)).toBe("VERIFIED");
  });
  it("rejects shared and live-report files without reserving or deleting them", async () => {
    const h = await fileFixture(),
      requirement = await db.requisitoDocumento.create({
        data: {
          usuarioId: admin.id,
          codigo: key(),
          nombre: "Synthetic shared attachment",
        },
      });
    await db.documentoVersion.create({
      data: {
        requisitoId: requirement.id,
        archivoId: h.file.id,
        cargadoPorId: admin.id,
        version: 1,
      },
    });
    await expect(
      withWorkerWriteBarrier(db, (tx) =>
        h.deletion.prepare(tx, h.file.id, h.purpose),
      ),
    ).rejects.toMatchObject({ code: "RETENTION_SHARED_EVIDENCE_OR_HOLD" });
    const reportFile = await fileFixture();
    await db.reporteExportacion.create({
      data: {
        requesterId: admin.id,
        type: "ATTENDANCE",
        filters: {},
        status: "COMPLETADO",
        archivoId: reportFile.file.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await expect(
      withWorkerWriteBarrier(db, (tx) =>
        reportFile.deletion.prepare(tx, reportFile.file.id, reportFile.purpose),
      ),
    ).rejects.toMatchObject({ code: "RETENTION_RESOURCE_NOT_TERMINAL" });
    expect(h.storage.deleteVersion).not.toHaveBeenCalled();
    expect(reportFile.storage.deleteVersion).not.toHaveBeenCalled();
  });
  it("never broadens an immutable intent to a newly observed object version", async () => {
    const h = await fileFixture(),
      job = await withWorkerWriteBarrier(db, (tx) =>
        h.deletion.prepare(tx, h.file.id, h.purpose),
      );
    h.objects
      .get(`available:${h.file.objectKey}`)!
      .push({ id: "foreign-v2", etag: '"foreign"', deleteMarker: false });
    await expect(h.deletion.process(job.id)).rejects.toMatchObject({
      code: "OBJECT_DELETION_IDENTITY_CHANGED",
    });
    expect(h.storage.deleteVersion).not.toHaveBeenCalled();
    expect(h.objects.get(`available:${h.file.objectKey}`)).toHaveLength(2);
    expect(
      (await db.objectDeletionJob.findUniqueOrThrow({ where: { id: job.id } }))
        .state,
    ).toBe("PREPARED");
  });
  it("refuses to redirect a sealed deletion to a different storage namespace", async () => {
    const h = await fileFixture(),
      job = await withWorkerWriteBarrier(db, (tx) =>
        h.deletion.prepare(tx, h.file.id, h.purpose),
      );
    h.storage.deletionNamespace.mockReturnValue("b".repeat(64));
    await expect(h.deletion.process(job.id)).rejects.toMatchObject({
      code: "OBJECT_DELETION_STORAGE_CHANGED",
    });
    expect(h.storage.deleteVersion).not.toHaveBeenCalled();
    expect(h.storage.putSuppressionJournal).not.toHaveBeenCalled();
  });
  it("refuses a forged SQL manifest even when its checksum and identifier bindings match", async () => {
    const h = await fileFixture(),
      id = `c${randomUUID().replaceAll("-", "").slice(0, 28)}`;
    const manifest = {
      protocol: "ares-object-deletion-v1",
      operationId: id,
      fileFingerprint: operationFingerprint(h.file.id),
      purpose: h.purpose,
      storageNamespace: h.storage.deletionNamespace(),
      occurredAt: new Date().toISOString(),
      keyVersion: "deletion-v1",
      targets: [
        {
          bucket: "available",
          key: h.file.objectKey,
          versions: h.objects.get(`available:${h.file.objectKey}`)!,
        },
        { bucket: "quarantine", key: h.file.quarantineKey, versions: [] },
      ],
      signature: "0".repeat(64),
    };
    const manifestHash = operationFingerprint(manifest);
    await db.objectDeletionJob.create({
      data: {
        id,
        fileId: h.file.id,
        purpose: h.purpose,
        originalStatus: h.file.status,
        manifest,
        manifestHash,
        manifestRef: `deletion-intents/${id}-${manifestHash}.json`,
      },
    });
    await expect(h.deletion.process(id)).rejects.toMatchObject({
      code: "OBJECT_DELETION_MANIFEST_INVALID",
    });
    expect(h.storage.deleteVersion).not.toHaveBeenCalled();
    expect(h.storage.putSuppressionJournal).not.toHaveBeenCalled();
  });
  it("prevents duplicate dispatch across connections and refuses expired ownership", async () => {
    const h = await fileFixture(),
      job = await withWorkerWriteBarrier(db, (tx) =>
        h.deletion.prepare(tx, h.file.id, h.purpose),
      );
    const second = new ObjectDeletionService(
      replica,
      h.storage,
      config as any,
      new AuditService(replica),
    );
    const results = await Promise.allSettled([
      h.deletion.process(job.id),
      second.process(job.id),
    ]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(h.storage.deleteVersion).toHaveBeenCalledOnce();
    expect(
      await db.auditEvent.count({
        where: { action: "OBJECT_DELETION_VERIFIED", objectId: job.id },
      }),
    ).toBe(1);
  });
  it("preserves an in-flight dispatch after ABA and reconciles only after the lease expires", async () => {
    const h = await fileFixture(),
      job = await withWorkerWriteBarrier(db, (tx) =>
        h.deletion.prepare(tx, h.file.id, h.purpose),
      );
    h.storage.deleteVersion.mockImplementation(
      async (bucket: string, name: string) => {
        h.objects.set(`${bucket}:${name}`, []);
        await replica.recoveryWriteBarrier.update({
          where: { id: "global" },
          data: { active: true, version: { increment: 1 } },
        });
        await replica.recoveryWriteBarrier.update({
          where: { id: "global" },
          data: { active: false, version: { increment: 1 } },
        });
      },
    );
    await expect(h.deletion.process(job.id)).rejects.toMatchObject({
      code: "RECOVERY_WRITE_BARRIER_ACTIVE",
    });
    expect(
      (await db.objectDeletionJob.findUniqueOrThrow({ where: { id: job.id } }))
        .state,
    ).toBe("DISPATCHED");
    await expect(h.deletion.reconcile(job.id)).rejects.toMatchObject({
      code: "OBJECT_DELETION_LEASE_BUSY",
    });
    // Controlled expiry of a technical test lease, never reopening a domain decision.
    await db.objectDeletionJob.update({
      where: { id: job.id },
      data: { leaseUntil: new Date(0) },
    });
    expect(await h.deletion.reconcile(job.id)).toBe("VERIFIED");
    expect(h.storage.deleteVersion).toHaveBeenCalledOnce();
  });
  it("honors a hold before dispatch but cannot promise reversal after dispatch", async () => {
    const h = await fileFixture("RECHAZADO");
    const record = await db.registroRetencion.create({
      data: {
        categoria: "ARCHIVOS_RECHAZADOS",
        resourceType: "Archivo",
        resourceId: h.file.id,
        reglaId: rule.id,
        triggeredAt: new Date(0),
        archiveDueAt: new Date(0),
        actionDueAt: new Date(0),
      },
    });
    const job = await withWorkerWriteBarrier(db, (tx) =>
      h.deletion.prepare(tx, h.file.id, h.purpose, h.file.id),
    );
    const service = retention(h.storage, h.deletion);
    const hold = await service.createLegalHold(
      admin,
      {
        registroId: record.id,
        motivo: "Synthetic hold before dispatch",
        responsable: "Synthetic legal authority",
        reviewAt: new Date(Date.now() + 86400000),
      },
      key(),
    );
    await expect(h.deletion.process(job.id)).rejects.toMatchObject({
      code: "RETENTION_SHARED_EVIDENCE_OR_HOLD",
    });
    expect(h.storage.deleteVersion).not.toHaveBeenCalled();
    await service.releaseLegalHold(
      admin,
      hold.id,
      "Synthetic hold explicitly released",
      key(),
    );
    const original = h.storage.deleteVersion.getMockImplementation();
    h.storage.deleteVersion.mockImplementation(async (...args: any[]) => {
      await expect(
        service.createLegalHold(
          admin,
          {
            registroId: record.id,
            motivo: "Synthetic hold after dispatch",
            responsable: "Synthetic legal authority",
            reviewAt: new Date(Date.now() + 86400000),
          },
          key(),
        ),
      ).rejects.toMatchObject({ code: "OBJECT_DELETION_IRREVERSIBLE" });
      await original!(...args);
    });
    await h.deletion.process(job.id);
  });
  it("exposes only technical metadata and revalidates reconciliation authorization on replay", async () => {
    const h = await fileFixture(),
      job = await withWorkerWriteBarrier(db, (tx) =>
        h.deletion.prepare(tx, h.file.id, h.purpose),
      ),
      service = retention(h.storage, h.deletion);
    const listing = await service.listObjectDeletions(admin, 1, 100);
    expect(listing.items.some((row) => row.id === job.id)).toBe(true);
    expect(JSON.stringify(listing)).not.toContain(h.file.objectKey);
    expect(JSON.stringify(listing)).not.toContain("manifestRef");
    await expect(
      service.listObjectDeletions({ ...admin, rol: "PRESTADOR" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    h.storage.deleteVersion.mockImplementation(
      async (bucket: string, name: string) => {
        h.objects.set(`${bucket}:${name}`, []);
        throw new Error("ambiguous reply");
      },
    );
    await expect(h.deletion.process(job.id)).rejects.toThrow("ambiguous");
    const suffix = randomUUID().slice(0, 8),
      authority = await db.usuario.create({
        data: {
          codigo: `deletion-reconciler-${suffix}`,
          email: `deletion-reconciler-${suffix}@example.test`,
          rol: "ADMIN",
          estado: "ACTIVA",
          passwordHash: "synthetic-non-login",
        },
      });
    const intent = key();
    expect(
      await service.reconcileObjectDeletion(authority, job.id, intent),
    ).toMatchObject({ accepted: true, state: "VERIFIED" });
    expect(
      await service.reconcileObjectDeletion(authority, job.id, intent),
    ).toMatchObject({ accepted: true, state: "VERIFIED" });
    await db.usuario.update({
      where: { id: authority.id },
      data: { estado: "SUSPENDIDA" },
    });
    await expect(
      service.reconcileObjectDeletion(authority, job.id, intent),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(h.storage.deleteVersion).toHaveBeenCalledOnce();
    expect(
      (await db.archivo.findUniqueOrThrow({ where: { id: h.file.id } })).status,
    ).toBe("ELIMINACION_PENDIENTE");
  });
  it("retention finalizes only after verification, and retries audit failure without deleting again", async () => {
    const h = await fileFixture("RECHAZADO");
    const record = await db.registroRetencion.create({
      data: {
        categoria: "ARCHIVOS_RECHAZADOS",
        resourceType: "Archivo",
        resourceId: h.file.id,
        reglaId: rule.id,
        estado: "SUPRESION_PROGRAMADA",
        triggeredAt: new Date(0),
        archiveDueAt: new Date(0),
        actionDueAt: new Date(0),
        scheduledAt: new Date(),
      },
    });
    const batch = await db.loteSupresion.create({
      data: {
        estado: "AUTORIZADO",
        cutoffAt: new Date(),
        totalElementos: 1,
        creadoPorId: admin.id,
        autorizadoPorId: admin.id,
        authorizedAt: new Date(),
        elementos: { create: { registroId: record.id } },
      },
    });
    const failing = {
      append: async (input: any, tx: any) => {
        if (input.action === "SUPPRESSION_ITEM_EXECUTED")
          throw new Error("forced final audit failure");
        return audit.append(input, tx);
      },
    };
    await retention(h.storage, h.deletion, failing).processBatch(batch.id);
    const job = await db.objectDeletionJob.findUniqueOrThrow({
      where: { fileId: h.file.id },
    });
    expect(job.state).toBe("VERIFIED");
    expect(
      await db.registroSupresion.count({ where: { registroId: record.id } }),
    ).toBe(0);
    expect(
      (await db.archivo.findUniqueOrThrow({ where: { id: h.file.id } })).status,
    ).toBe("ELIMINACION_PENDIENTE");
    const deletes = h.storage.deleteVersion.mock.calls.length;
    await retention(h.storage, h.deletion).retryBatch(admin, batch.id, key());
    expect(
      (await db.objectDeletionJob.findUniqueOrThrow({ where: { id: job.id } }))
        .state,
    ).toBe("COMPLETE");
    expect(
      await db.registroSupresion.count({ where: { registroId: record.id } }),
    ).toBe(1);
    expect(h.storage.deleteVersion).toHaveBeenCalledTimes(deletes);
  });
  it.skipIf(!endpoint)(
    "deletes all sealed versions in fresh real MinIO buckets and retains immutable intent",
    async () => {
      const suffix = randomUUID().slice(0, 8),
        names = {
          available: `deletion-${suffix}-available`,
          quarantine: `deletion-${suffix}-quarantine`,
          journal: `deletion-${suffix}-journal`,
          public: `deletion-${suffix}-public`,
        };
      const s3 = new S3Client({
        endpoint,
        region: "us-east-1",
        forcePathStyle: true,
        credentials: {
          accessKeyId: "ares-local",
          secretAccessKey: "ares-local-secret",
        },
      });
      for (const bucket of Object.values(names)) {
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        await s3.send(
          new PutBucketVersioningCommand({
            Bucket: bucket,
            VersioningConfiguration: { Status: "Enabled" },
          }),
        );
      }
      const cfg = new ConfigService({
        DATABASE_URL: url,
        S3_ENDPOINT: endpoint,
        S3_REGION: "us-east-1",
        S3_FORCE_PATH_STYLE: true,
        S3_ACCESS_KEY: "ares-local",
        S3_SECRET_KEY: "ares-local-secret",
        S3_AVAILABLE_BUCKET: names.available,
        S3_QUARANTINE_BUCKET: names.quarantine,
        S3_PUBLIC_BUCKET: names.public,
        S3_SUPPRESSION_JOURNAL_BUCKET: names.journal,
        SUPPRESSION_JOURNAL_KEY_VERSION: "deletion-v1",
        SUPPRESSION_JOURNAL_HMAC_SECRET:
          "deletion-acceptance-only-key-not-for-production-2026",
      });
      const storage = new S3Storage(cfg as any),
        h = await fileFixture();
      await storage.put("available", h.file.objectKey, Buffer.from("one"));
      await storage.put("available", h.file.objectKey, Buffer.from("two"));
      await storage.put(
        "quarantine",
        h.file.quarantineKey,
        Buffer.from("quarantine"),
      );
      const service = new ObjectDeletionService(db, storage, cfg as any, audit);
      const job = await withWorkerWriteBarrier(db, (tx) =>
        service.prepare(tx, h.file.id, h.purpose),
      );
      await service.process(job.id);
      expect(
        await storage.deletionVersions(
          "available",
          h.file.objectKey,
          AbortSignal.timeout(10000),
        ),
      ).toEqual([]);
      expect(
        await storage.deletionVersions(
          "quarantine",
          h.file.quarantineKey,
          AbortSignal.timeout(10000),
        ),
      ).toEqual([]);
      await withWorkerWriteBarrier(db, (tx) => service.complete(tx, job.id));
      expect((await storage.listDeletionIntents()).keys).toContain(
        job.manifestRef,
      );
      // Leave test buckets and fingerprints as evidence; never purge a shared bucket.
      s3.destroy();
    },
  );
});

describe("absence attachments through the durable protocol (MariaDB, simulated transport)", () => {
  let subject: any;
  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    subject = await db.usuario.create({
      data: {
        codigo: `absence-subject-${suffix}`,
        email: `absence-subject-${suffix}@example.test`,
        rol: "PRESTADOR",
        estado: "ACTIVA",
        passwordHash: "synthetic-non-login",
      },
    });
  });
  let day = 0;
  async function absenceFixture(
    options: {
      estado?: "JUSTIFICADA" | "PENDIENTE_JUSTIFICACION";
      shareWith?: any;
    } = {},
  ) {
    const h = memoryStorage();
    const id = randomUUID().replaceAll("-", "").slice(0, 30);
    const objectKey = `synthetic/absence/${id}.pdf`;
    const file = await db.archivo.create({
      data: {
        id,
        propietarioId: subject.id,
        objectKey,
        quarantineKey: `synthetic/q/${id}`,
        originalName: "Synthetic private justification",
        detectedMime: "application/pdf",
        sizeBytes: 3,
        status: "DISPONIBLE",
      },
    });
    h.objects.set(`available:${objectKey}`, [
      { id: "v1", etag: '"synthetic-etag"', deleteMarker: false },
    ]);
    const make = async (estado: string) => {
      day += 1;
      return db.ausencia.create({
        data: {
          userId: subject.id,
          sedeId: 1,
          areaId: 1,
          turnoId: 1,
          fecha: new Date(Date.UTC(2031, 0, day)),
          estado: estado as any,
          plazoLimiteAt: new Date(Date.now() - 86_400_000),
          apelacionLimiteAt: new Date(Date.now() - 3_600_000),
          motivoResolucion: "private resolution narrative",
        },
      });
    };
    const absence = await make(options.estado ?? "JUSTIFICADA");
    await db.justificacionAusencia.create({
      data: {
        ausenciaId: absence.id,
        motivo: "private medical narrative",
        archivoId: file.id,
        solicitadoPor: subject.id,
      },
    });
    if (options.shareWith) {
      const other = await make("JUSTIFICADA");
      await db.justificacionAusencia.create({
        data: {
          ausenciaId: other.id,
          motivo: "second narrative",
          archivoId: file.id,
          solicitadoPor: subject.id,
        },
      });
    }
    const deletion = new ObjectDeletionService(
      db,
      h.storage,
      config as any,
      audit,
    );
    return { ...h, file, absence, deletion };
  }
  const suppress = (f: any) =>
    withWorkerWriteBarrier(db, (tx) =>
      suppressOperationalEvidence(
        db,
        f.deletion,
        "AbsenceEvidence",
        f.absence.id,
        tx,
      ),
    );

  it("keeps the text until the attachment is verified gone, then redacts and completes", async () => {
    const f = await absenceFixture();
    const pending: any = await suppress(f);
    expect(pending?.deletionJobId).toBeTruthy();
    expect(f.storage.deleteVersion).not.toHaveBeenCalled();
    expect(
      (await db.archivo.findUniqueOrThrow({ where: { id: f.file.id } })).status,
    ).toBe("ELIMINACION_PENDIENTE");
    expect(
      (await db.ausencia.findUniqueOrThrow({ where: { id: f.absence.id } }))
        .motivoResolucion,
    ).toBe("private resolution narrative");
    // Unfinished job: still pending, nothing redacted, no second intent.
    expect(((await suppress(f)) as any)?.deletionJobId).toBe(
      pending.deletionJobId,
    );
    await f.deletion.process(pending.deletionJobId);
    expect(f.storage.deleteVersion).toHaveBeenCalledTimes(1);
    expect(f.objects.get(`available:${f.file.objectKey}`)).toEqual([]);
    expect(await suppress(f)).toBeUndefined();
    const archivo = await db.archivo.findUniqueOrThrow({
      where: { id: f.file.id },
    });
    expect(archivo).toMatchObject({
      status: "ELIMINADO",
      originalName: "[SUPRIMIDO]",
    });
    expect(
      (await db.ausencia.findUniqueOrThrow({ where: { id: f.absence.id } }))
        .motivoResolucion,
    ).toBe("[SUPRIMIDO]");
    expect(
      (
        await db.justificacionAusencia.findFirstOrThrow({
          where: { ausenciaId: f.absence.id },
        })
      ).motivo,
    ).toBe("[SUPRIMIDO]");
    const job = await db.objectDeletionJob.findUniqueOrThrow({
      where: { fileId: f.file.id },
    });
    expect(job).toMatchObject({
      purpose: "ABSENCE_ATTACHMENT",
      resourceId: f.absence.id,
      state: "COMPLETE",
    });
    // Replaying after completion is a no-op, not a second effect.
    expect(await suppress(f)).toBeUndefined();
    expect(f.storage.deleteVersion).toHaveBeenCalledTimes(1);
  });

  it("refuses an attachment shared by another absence and starts nothing", async () => {
    const f = await absenceFixture({ shareWith: true });
    await expect(suppress(f)).rejects.toMatchObject({
      code: "RETENTION_SHARED_EVIDENCE_OR_HOLD",
    });
    expect(
      await db.objectDeletionJob.count({ where: { fileId: f.file.id } }),
    ).toBe(0);
    expect(
      (await db.archivo.findUniqueOrThrow({ where: { id: f.file.id } })).status,
    ).toBe("DISPONIBLE");
  });

  it("refuses a non-terminal absence", async () => {
    const f = await absenceFixture({ estado: "PENDIENTE_JUSTIFICACION" });
    await expect(suppress(f)).rejects.toMatchObject({
      code: "RETENTION_RESOURCE_NOT_TERMINAL",
    });
    expect(
      await db.objectDeletionJob.count({ where: { fileId: f.file.id } }),
    ).toBe(0);
  });
});
