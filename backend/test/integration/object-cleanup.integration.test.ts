import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { AuditService } from "../../src/auth/audit.service";
import { ObjectDeletionService } from "../../src/storage/object-deletion.service";
import { OrphanObjectDeletionService } from "../../src/storage/orphan-object-deletion.service";
import { withWorkerWriteBarrier } from "../../src/common/domain/worker-write-barrier";
import { canonicalOperation } from "../../src/common/domain/canonical-operation";
import type { ObjectVersion } from "../../src/storage/storage.types";

// The restore cases scan every sealed job, so this file owns its database: jobs
// signed by other suites (other keys or namespaces) must not be in it.
const url = process.env.DATABASE_URL;
const dedicated = /^\/ares_object_cleanup_(test|ci)$/.test(
  url ? new URL(url).pathname : "",
);
const settings = {
  DATABASE_URL: url,
  SUPPRESSION_JOURNAL_KEY_VERSION: "cleanup-v1",
  SUPPRESSION_JOURNAL_HMAC_SECRET:
    "cleanup-acceptance-only-key-not-for-production-2026",
  OBJECT_CLEANUP_ENABLED: true,
  STORAGE_ORPHAN_MIN_AGE_MS: 3_600_000,
};
const config = new ConfigService(settings);
const db = new PrismaService(config),
  audit = new AuditService(db);
const id30 = () => randomUUID().replaceAll("-", "").slice(0, 30);

function memoryStorage() {
  const objects = new Map<string, ObjectVersion[]>(),
    ages = new Map<string, Date>(),
    manifests = new Map<string, Buffer>();
  const storage: any = {
    deletionNamespace: vi.fn(() => "b".repeat(64)),
    deletionVersions: vi.fn(async (bucket, name) =>
      structuredClone(objects.get(`${bucket}:${name}`) ?? []),
    ),
    deleteVersion: vi.fn(async (bucket, name, versionId) => {
      objects.set(
        `${bucket}:${name}`,
        (objects.get(`${bucket}:${name}`) ?? []).filter(
          (row) => row.id !== versionId,
        ),
      );
    }),
    lastModified: vi.fn(async (bucket, name) =>
      objects.get(`${bucket}:${name}`)?.length
        ? (ages.get(`${bucket}:${name}`) ?? null)
        : null,
    ),
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
  const put = (bucket: string, key: string, ageMs = 2 * 3_600_000) => {
    objects.set(`${bucket}:${key}`, [
      { id: `v-${randomUUID().slice(0, 8)}`, etag: '"e"', deleteMarker: false },
    ]);
    ages.set(`${bucket}:${key}`, new Date(Date.now() - ageMs));
  };
  return { storage, objects, manifests, put };
}

function fixture(overrides: Record<string, unknown> = {}) {
  const h = memoryStorage();
  const cfg = new ConfigService({ ...settings, ...overrides });
  const deletions = new ObjectDeletionService(db, h.storage, cfg as any, audit);
  const cleanup = new OrphanObjectDeletionService(
    db,
    h.storage,
    cfg as any,
    deletions,
  );
  return { ...h, deletions, cleanup };
}
const prepare = (
  f: ReturnType<typeof fixture>,
  kind: "ORPHAN_OBJECT" | "QUARANTINE_COPY",
  bucket: "quarantine" | "available",
  key: string,
) =>
  withWorkerWriteBarrier(db, (tx) =>
    f.cleanup.prepare(tx, { kind, bucket, key }),
  );
const finish = (f: ReturnType<typeof fixture>, id: string) =>
  withWorkerWriteBarrier(db, (tx) => f.cleanup.complete(tx, id));
const newKey = () => `synthetic/cleanup/${randomUUID()}`;

let runOwner = 0;
async function withFreeze<T>(
  run: (runId: string, version: number) => Promise<T>,
) {
  const created = await db.recoveryRun.create({
    data: {
      name: "Synthetic cleanup drill",
      scope: "SECUNDARIO",
      isDrill: true,
      createdById: runOwner,
      responsibleId: runOwner,
      rpoTargetMinutes: 1440,
      rtoTargetMinutes: 480,
    },
  });
  const runId = created.id;
  const barrier = await db.recoveryWriteBarrier.update({
    where: { id: "global" },
    data: { active: true, runId, version: { increment: 1 } },
  });
  try {
    return await run(runId, barrier.version);
  } finally {
    await db.recoveryWriteBarrier.update({
      where: { id: "global" },
      data: { active: false, runId: null, version: { increment: 1 } },
    });
    await db.recoveryRun.update({
      where: { id: runId },
      data: { state: "CANCELLED" },
    });
  }
}

describe.skipIf(!dedicated)(
  "orphan and quarantine-copy cleanup on MariaDB (simulated transport)",
  () => {
    let owner: any;
    beforeAll(async () => {
      const suffix = randomUUID().slice(0, 8);
      owner = await db.usuario.create({
        data: {
          codigo: `cleanup-owner-${suffix}`,
          email: `cleanup-owner-${suffix}@example.test`,
          rol: "ADMIN",
          estado: "ACTIVA",
          passwordHash: "synthetic-non-login",
        },
      });
      runOwner = owner.id;
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    const file = (key: string, quarantine = key, status: any = "DISPONIBLE") =>
      db.archivo.create({
        data: {
          id: id30(),
          propietarioId: owner.id,
          objectKey: key,
          quarantineKey: quarantine,
          originalName: "Synthetic private fixture",
          detectedMime: "application/pdf",
          sizeBytes: 3,
          status,
        },
      });

    it("deletes an old unreferenced orphan through sealed exact versions", async () => {
      const f = fixture();
      const key = newKey();
      f.put("quarantine", key);
      const job = await prepare(f, "ORPHAN_OBJECT", "quarantine", key);
      expect(job.state).toBe("PREPARED");
      expect(job.activeKey).toBe(`quarantine:${key}`);
      expect(f.storage.deleteVersion).not.toHaveBeenCalled();
      await f.cleanup.process(job.id);
      expect(f.storage.deleteVersion).toHaveBeenCalledTimes(1);
      expect(f.objects.get(`quarantine:${key}`)).toEqual([]);
      expect(f.manifests.has(job.manifestRef)).toBe(true);
      await finish(f, job.id);
      const done = await db.orphanObjectDeletion.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(done).toMatchObject({ state: "COMPLETE", activeKey: null });
      expect(f.storage.delete).not.toHaveBeenCalled();
    });

    it("never touches a referenced, recent, protected or disabled target", async () => {
      const f = fixture();
      const live = newKey();
      f.put("available", live);
      await file(live);
      await expect(
        prepare(f, "ORPHAN_OBJECT", "available", live),
      ).rejects.toMatchObject({ code: "OBJECT_CLEANUP_OBJECT_REFERENCED" });
      const recent = newKey();
      f.put("quarantine", recent, 60_000);
      await expect(
        prepare(f, "ORPHAN_OBJECT", "quarantine", recent),
      ).rejects.toMatchObject({ code: "OBJECT_CLEANUP_TOO_RECENT" });
      await expect(
        prepare(f, "ORPHAN_OBJECT", "available", "audit-manifests/2026/x.json"),
      ).rejects.toMatchObject({ code: "OBJECT_CLEANUP_KEY_PROTECTED" });
      const off = fixture({ OBJECT_CLEANUP_ENABLED: false });
      off.put("quarantine", newKey());
      await expect(
        prepare(off, "ORPHAN_OBJECT", "quarantine", newKey()),
      ).rejects.toMatchObject({ code: "OBJECT_CLEANUP_DISABLED" });
      expect(f.storage.deleteVersion).not.toHaveBeenCalled();
      expect(
        await db.orphanObjectDeletion.count({
          where: { objectKey: { in: [live, recent] } },
        }),
      ).toBe(0);
    });

    it("aborts when a reference appears after the intent was sealed", async () => {
      const f = fixture();
      const key = newKey();
      f.put("quarantine", key);
      const job = await prepare(f, "ORPHAN_OBJECT", "quarantine", key);
      await file(key);
      await expect(f.cleanup.process(job.id)).rejects.toMatchObject({
        code: "OBJECT_CLEANUP_OBJECT_REFERENCED",
      });
      expect(f.storage.deleteVersion).not.toHaveBeenCalled();
    });

    it("aborts when a new version appears after the intent was sealed", async () => {
      const f = fixture();
      const key = newKey();
      f.put("quarantine", key);
      const job = await prepare(f, "ORPHAN_OBJECT", "quarantine", key);
      f.objects.get(`quarantine:${key}`)!.push({
        id: "v-late",
        etag: '"late"',
        deleteMarker: false,
      });
      await expect(f.cleanup.process(job.id)).rejects.toMatchObject({
        code: "OBJECT_DELETION_IDENTITY_CHANGED",
      });
      expect(f.storage.deleteVersion).not.toHaveBeenCalled();
    });

    it("removes only the redundant quarantine copy of a promoted file", async () => {
      const f = fixture();
      const key = newKey();
      const promoted = await file(key);
      f.put("quarantine", key);
      f.put("available", key);
      const job = await prepare(f, "QUARANTINE_COPY", "quarantine", key);
      expect(job.archivoId).toBe(promoted.id);
      await f.cleanup.process(job.id);
      await finish(f, job.id);
      expect(f.objects.get(`quarantine:${key}`)).toEqual([]);
      expect(f.objects.get(`available:${key}`)).toHaveLength(1);
      expect(
        (await db.archivo.findUniqueOrThrow({ where: { id: promoted.id } }))
          .status,
      ).toBe("DISPONIBLE");
    });

    it("keeps the private copy when the served copy is missing or the file is not live", async () => {
      const f = fixture();
      const key = newKey();
      await file(key);
      f.put("quarantine", key);
      await expect(
        prepare(f, "QUARANTINE_COPY", "quarantine", key),
      ).rejects.toMatchObject({ code: "OBJECT_CLEANUP_SERVED_COPY_MISSING" });
      const rejected = newKey();
      await file(rejected, rejected, "RECHAZADO");
      f.put("quarantine", rejected);
      f.put("available", rejected);
      await expect(
        prepare(f, "QUARANTINE_COPY", "quarantine", rejected),
      ).rejects.toMatchObject({ code: "OBJECT_CLEANUP_PURPOSE_MISMATCH" });
      expect(f.storage.deleteVersion).not.toHaveBeenCalled();
    });

    it("reconciles an ambiguous deletion read-only and seals it", async () => {
      const f = fixture();
      const key = newKey();
      f.put("quarantine", key);
      const job = await prepare(f, "ORPHAN_OBJECT", "quarantine", key);
      f.storage.deleteVersion.mockImplementationOnce(async () => {
        throw new Error("response lost after the delete reached the store");
      });
      await expect(f.cleanup.process(job.id)).rejects.toThrow();
      expect(
        (
          await db.orphanObjectDeletion.findUniqueOrThrow({
            where: { id: job.id },
          })
        ).state,
      ).toBe("UNCERTAIN");
      // The store did apply the delete; the sealed inventory is gone.
      f.objects.set(`quarantine:${key}`, []);
      expect(await f.cleanup.reconcile(job.id)).toBe("VERIFIED");
      await finish(f, job.id);
      expect(
        (
          await db.orphanObjectDeletion.findUniqueOrThrow({
            where: { id: job.id },
          })
        ).state,
      ).toBe("COMPLETE");
    });

    describe("restore to an older snapshot", () => {
      beforeAll(async () => {
        // Earlier cases leave deliberately unfinished jobs; seal them so readiness is
        // decided only by the intents under test (synthetic evidence DB).
        await db.$executeRaw`UPDATE OrphanObjectDeletion SET state='COMPLETE', verifiedAt=COALESCE(verifiedAt, NOW(3)), completedAt=NOW(3), activeKey=NULL, leaseOwner=NULL, leaseUntil=NULL WHERE state <> 'COMPLETE'`;
      });
      it("imports an external orphan intent the SQL lost, proves it and clears readiness", async () => {
        const f = fixture();
        const key = newKey();
        f.put("quarantine", key);
        const job = await prepare(f, "ORPHAN_OBJECT", "quarantine", key);
        await f.cleanup.process(job.id);
        await finish(f, job.id);
        // The restored snapshot predates the job: SQL forgets it, the store does not.
        await db.orphanObjectDeletion.delete({ where: { id: job.id } });
        const before = await f.deletions.recoveryAssessment();
        expect(before.ready).toBe(false);
        expect(await f.deletions.unknownIntents()).toContain(job.manifestRef);
        expect(await f.deletions.unknownIntents()).toContain(job.manifestRef);
        await withFreeze(async (runId, version) => {
          const imported = await f.deletions.importExternalIntent(
            job.manifestRef,
            runId,
            version,
          );
          expect(imported).toMatchObject({ outcome: "IMPORTED", id: job.id });
          expect(
            (
              await db.orphanObjectDeletion.findUniqueOrThrow({
                where: { id: job.id },
              })
            ).state,
          ).toBe("UNCERTAIN");
          expect(
            await f.deletions.verifyAnyImported(job.id, runId, version),
          ).toBe("COMPLETE");
          // Importing twice is a no-op, never a second effect.
          expect(
            await f.deletions.importExternalIntent(
              job.manifestRef,
              runId,
              version,
            ),
          ).toEqual({ outcome: "ALREADY_KNOWN" });
        });
        expect(f.storage.deleteVersion).toHaveBeenCalledTimes(1);
        const after = await f.deletions.recoveryAssessment();
        expect(after.orphanIntents).not.toContainEqual(
          expect.objectContaining({ ref: job.manifestRef }),
        );
      });

      it("refuses to import outside the owning recovery run", async () => {
        const f = fixture();
        const key = newKey();
        f.put("quarantine", key);
        const job = await prepare(f, "ORPHAN_OBJECT", "quarantine", key);
        await f.cleanup.process(job.id);
        await finish(f, job.id);
        await db.orphanObjectDeletion.delete({ where: { id: job.id } });
        await expect(
          f.deletions.importExternalIntent(job.manifestRef, "run-none", 1),
        ).rejects.toMatchObject({ code: "RECOVERY_BARRIER_LOST" });
        await withFreeze(async (_runId, version) => {
          await expect(
            f.deletions.importExternalIntent(
              job.manifestRef,
              "another-run",
              version,
            ),
          ).rejects.toMatchObject({ code: "RECOVERY_BARRIER_LOST" });
        });
        expect(
          await db.orphanObjectDeletion.count({ where: { id: job.id } }),
        ).toBe(0);
      });

      it("rejects an intent whose bytes or signature were altered", async () => {
        const f = fixture();
        const key = newKey();
        f.put("quarantine", key);
        const job = await prepare(f, "ORPHAN_OBJECT", "quarantine", key);
        await f.cleanup.process(job.id);
        await finish(f, job.id);
        await db.orphanObjectDeletion.delete({ where: { id: job.id } });
        const tampered = JSON.parse(
          f.manifests.get(job.manifestRef)!.toString(),
        );
        tampered.targets[0].key = "synthetic/other";
        f.manifests.set(job.manifestRef, Buffer.from(JSON.stringify(tampered)));
        await withFreeze(async (runId, version) => {
          await expect(
            f.deletions.importExternalIntent(job.manifestRef, runId, version),
          ).rejects.toMatchObject({ code: "OBJECT_DELETION_MANIFEST_INVALID" });
        });
        expect(
          await db.orphanObjectDeletion.count({ where: { id: job.id } }),
        ).toBe(0);
      });

      it("rebuilds an older file job, reserves the file and finishes only after proof", async () => {
        const f = fixture();
        const key = `synthetic/rejected/${randomUUID()}.pdf`;
        const rejected = await file(key, `${key}.q`, "RECHAZADO");
        f.put("available", key);
        f.put("quarantine", `${key}.q`);
        const job = await withWorkerWriteBarrier(db, (tx) =>
          f.deletions.prepare(tx, rejected.id, "REJECTED_FILE", rejected.id),
        );
        await f.deletions.process(job.id);
        await withWorkerWriteBarrier(db, (tx) =>
          f.deletions.complete(tx, job.id),
        );
        // Older snapshot: file still RECHAZADO and no job row.
        await db.objectDeletionJob.delete({ where: { id: job.id } });
        await db.analisisArchivo.deleteMany({
          where: { archivoId: rejected.id },
        });
        await db.archivo.delete({ where: { id: rejected.id } });
        await db.archivo.create({ data: { ...rejected, status: "RECHAZADO" } });
        await withFreeze(async (runId, version) => {
          const imported = await f.deletions.importExternalIntent(
            job.manifestRef,
            runId,
            version,
          );
          expect(imported.outcome).toBe("IMPORTED");
          expect(
            (await db.archivo.findUniqueOrThrow({ where: { id: rejected.id } }))
              .status,
          ).toBe("ELIMINACION_PENDIENTE");
          expect(
            await f.deletions.verifyAnyImported(job.id, runId, version),
          ).toBe("COMPLETE");
        });
        expect(
          (await db.archivo.findUniqueOrThrow({ where: { id: rejected.id } }))
            .status,
        ).toBe("ELIMINADO");
        expect(f.storage.deleteVersion).toHaveBeenCalledTimes(2);
      });

      it("acknowledges an intent whose file does not exist in the snapshot", async () => {
        const f = fixture();
        const absentId = id30();
        const manifest = f.deletions.sign({
          protocol: "ares-object-deletion-v1",
          operationId: `c${randomUUID().replaceAll("-", "").slice(0, 28)}`,
          fileFingerprint: (await import("node:crypto"))
            .createHash("sha256")
            .update(canonicalOperation(absentId))
            .digest("hex"),
          purpose: "REJECTED_FILE",
          storageNamespace: "b".repeat(64),
          occurredAt: new Date().toISOString(),
          keyVersion: "cleanup-v1",
          targets: [
            { bucket: "available", key: "synthetic/never", versions: [] },
            { bucket: "quarantine", key: "synthetic/never.q", versions: [] },
          ],
        });
        const hash = (await import("node:crypto"))
          .createHash("sha256")
          .update(canonicalOperation(manifest))
          .digest("hex");
        const ref = `deletion-intents/${manifest.operationId}-${hash}.json`;
        f.manifests.set(ref, Buffer.from(canonicalOperation(manifest)));
        await withFreeze(async (runId, version) => {
          expect(
            await f.deletions.importExternalIntent(ref, runId, version),
          ).toEqual({ outcome: "ACKNOWLEDGED" });
        });
        expect(
          await db.objectDeletionAcknowledgement.count({
            where: { manifestRef: ref, reason: "SUBJECT_ABSENT_IN_SNAPSHOT" },
          }),
        ).toBe(1);
        expect(await f.deletions.unknownIntents()).not.toContain(ref);
      });
    });
  },
);

const endpoint = process.env.ARES_TEST_DELETION_S3_ENDPOINT;
describe.skipIf(!endpoint || !dedicated)(
  "orphan cleanup in fresh real MinIO buckets",
  () => {
    it("removes every sealed version of an orphan and keeps the immutable intent", async () => {
      const { S3Client, CreateBucketCommand, PutBucketVersioningCommand } =
        await import("@aws-sdk/client-s3");
      const { S3Storage } = await import("../../src/storage/s3.storage");
      if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint!))
        throw new Error("Real cleanup uses a local endpoint and new buckets");
      const suffix = randomUUID().slice(0, 8),
        names = {
          available: `cleanup-${suffix}-available`,
          quarantine: `cleanup-${suffix}-quarantine`,
          journal: `cleanup-${suffix}-journal`,
          public: `cleanup-${suffix}-public`,
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
        ...settings,
        S3_ENDPOINT: endpoint,
        S3_REGION: "us-east-1",
        S3_FORCE_PATH_STYLE: true,
        S3_ACCESS_KEY: "ares-local",
        S3_SECRET_KEY: "ares-local-secret",
        S3_AVAILABLE_BUCKET: names.available,
        S3_QUARANTINE_BUCKET: names.quarantine,
        S3_PUBLIC_BUCKET: names.public,
        S3_SUPPRESSION_JOURNAL_BUCKET: names.journal,
        STORAGE_ORPHAN_MIN_AGE_MS: 0,
      });
      const storage = new S3Storage(cfg as any);
      const deletions = new ObjectDeletionService(
        db,
        storage,
        cfg as any,
        audit,
      );
      const cleanup = new OrphanObjectDeletionService(
        db,
        storage,
        cfg as any,
        deletions,
      );
      const key = newKey();
      await storage.put("quarantine", key, Buffer.from("one"));
      await storage.put("quarantine", key, Buffer.from("two"));
      const job = await withWorkerWriteBarrier(db, (tx) =>
        cleanup.prepare(tx, {
          kind: "ORPHAN_OBJECT",
          bucket: "quarantine",
          key,
        }),
      );
      await cleanup.process(job.id);
      expect(
        await storage.deletionVersions(
          "quarantine",
          key,
          AbortSignal.timeout(10000),
        ),
      ).toEqual([]);
      await withWorkerWriteBarrier(db, (tx) => cleanup.complete(tx, job.id));
      expect((await storage.listDeletionIntents()).keys).toContain(
        job.manifestRef,
      );
      s3.destroy();
    });
  },
);
