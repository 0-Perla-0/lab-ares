import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { AuditService } from "../../src/auth/audit.service";
import { RetentionService } from "../../src/retention/retention.service";
import { NotificationsService } from "../../src/notifications/notifications.service";
import { S3Storage } from "../../src/storage/s3.storage";
import { SuppressionJournalWorker } from "../../src/recovery/suppression-journal.worker";
import { verifyJournalEnvelope } from "../../src/recovery/journal-integrity";

const url = process.env.DATABASE_URL;
if (!url || !/_(test|ci)$/.test(new URL(url).pathname))
  throw new Error("Worker safety requires isolated _test/_ci database");
const config = new ConfigService({
  DATABASE_URL: url,
  RETENTION_INSTITUTIONAL_POLICIES_APPROVED: false,
  RETENTION_LEASE_MS: 120000,
  RETENTION_MAX_ATTEMPTS: 3,
  RETENTION_RETRY_BASE_MS: 60000,
  RETENTION_BATCH_SIZE: 10,
});
const db = new PrismaService(config),
  replica = new PrismaService(config);
const endpoint = process.env.ARES_TEST_JOURNAL_S3_ENDPOINT;
if (
  endpoint &&
  (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint) ||
    !/^\/ares_retention_safety_(test|ci)$/.test(new URL(url).pathname))
)
  throw new Error(
    "Real journal acceptance requires explicit local storage and dedicated safety DB",
  );
const audit = new AuditService(db),
  key = () => `safety-${randomUUID()}`;
let admin: any, rule: any;
const service = (
  database = db,
  centralAudit: any = new AuditService(database),
) =>
  new RetentionService(
    database,
    centralAudit,
    new NotificationsService(database),
    config as any,
    {} as any,
    {} as any,
  );
// Hook *between committed transactions*, never bypass their SQL locks or add
// test routes to production. This makes post-claim races reproducible.
function afterClaim(hook: () => Promise<unknown>) {
  let calls = 0;
  return new Proxy(db, {
    get(target, property) {
      if (property === "$transaction")
        return async (...args: any[]) => {
          const result = await (target.$transaction as any)(...args);
          if (++calls === 1) await hook();
          return result;
        };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
async function fixture(live = false) {
  const resourceId = `safety-${randomUUID()}`;
  const expiresAt = new Date(Date.now() + (live ? 3600000 : -3600000));
  await db.session.create({
    data: {
      id: resourceId,
      userId: admin.id,
      data: { synthetic: true },
      expiresAt,
      absoluteExpiresAt: expiresAt,
    },
  });
  const record = await db.registroRetencion.create({
    data: {
      categoria: "SESIONES_TOKENS",
      resourceType: "Session",
      resourceId,
      subjectId: admin.id,
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
    include: {
      elementos: { include: { registro: { include: { regla: true } } } },
    },
  });
  return { resourceId, record, batch, item: batch.elementos[0] };
}
describe("retention worker safety on independent MariaDB connections", () => {
  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    admin = await db.usuario.create({
      data: {
        codigo: `safety-admin-${suffix}`,
        email: `safety-admin-${suffix}@example.test`,
        passwordHash: "synthetic-non-login",
        rol: "ADMIN",
        estado: "ACTIVA",
      },
    });
    // Synthetic zero-day provisional test policy only; no institutional domain
    // or application worker is enabled by this fixture.
    const created = await service().createRule(
      admin,
      {
        categoria: "SESIONES_TOKENS",
        finalidad: "Synthetic safety acceptance only",
        responsable: "Synthetic acceptance authority",
        eventoInicio: "Synthetic session expiry",
        periodoActivoDias: 0,
        periodoBloqueadoDias: 0,
        accionFinal: "ELIMINAR",
        fundamento: "Isolated test fixture; not an institutional policy",
        provisional: true,
        automatica: false,
      },
      key(),
    );
    rule = await service().approveRule(
      admin,
      created.id,
      "Synthetic provisional acceptance approval",
      key(),
    );
  });
  afterAll(async () => {
    await db.$disconnect();
    await replica.$disconnect();
  });
  it("commits the DB adapter, receipt, audit and journal once across two workers", async () => {
    const f = await fixture();
    await Promise.all([
      service().processBatch(f.batch.id),
      service(replica).processBatch(f.batch.id),
    ]);
    expect(
      await db.session.findUnique({ where: { id: f.resourceId } }),
    ).toBeNull();
    expect(
      await db.registroSupresion.count({ where: { registroId: f.record.id } }),
    ).toBe(1);
    expect(
      await db.suppressionJournalEntry.count({
        where: { registroSupresion: { registroId: f.record.id } },
      }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: {
          action: "SUPPRESSION_ITEM_EXECUTED",
          correlationId: f.record.id,
        },
      }),
    ).toBe(1);
    expect(
      (await db.loteSupresion.findUniqueOrThrow({ where: { id: f.batch.id } }))
        .estado,
    ).toBe("COMPLETADO");
  });
  it("deduplicates administrative intent across replicas and revalidates a frozen replay", async () => {
    const intent = key(),
      reason = "Synthetic preservation request for concurrency acceptance";
    const [first, second] = await Promise.all([
      service().createRequest(admin, reason, intent),
      service(replica).createRequest(admin, reason, intent),
    ]);
    expect(first).toEqual(second);
    expect(
      await db.operacionRetencion.count({
        where: { actorId: admin.id, key: intent },
      }),
    ).toBe(1);
    await replica.recoveryWriteBarrier.update({
      where: { id: "global" },
      data: { active: true, version: { increment: 1 } },
    });
    try {
      await expect(
        service().createRequest(admin, reason, intent),
      ).rejects.toMatchObject({ code: "RECOVERY_WRITE_BARRIER_ACTIVE" });
    } finally {
      await replica.recoveryWriteBarrier.update({
        where: { id: "global" },
        data: { active: false, version: { increment: 1 } },
      });
    }
  });
  it("rolls back the actual session deletion and journal if central audit fails", async () => {
    const f = await fixture();
    const failing = {
      append: async (input: any, tx: any) => {
        if (input.action === "SUPPRESSION_ITEM_EXECUTED")
          throw new Error("forced audit outage");
        return audit.append(input, tx);
      },
    };
    await service(db, failing).processBatch(f.batch.id);
    expect(
      await db.session.findUnique({ where: { id: f.resourceId } }),
    ).not.toBeNull();
    expect(
      await db.registroSupresion.count({ where: { registroId: f.record.id } }),
    ).toBe(0);
    expect(
      (
        await db.elementoLoteSupresion.findUniqueOrThrow({
          where: { id: f.item.id },
        })
      ).estado,
    ).toBe("PENDIENTE");
  });
  it("honors a legal hold committed by another authority between claim and effect", async () => {
    const f = await fixture();
    const instrumented = afterClaim(() =>
      service(replica).createLegalHold(
        admin,
        {
          registroId: f.record.id,
          motivo: "Synthetic legal preservation test",
          responsable: "Synthetic legal authority",
          reviewAt: new Date(Date.now() + 86400000),
        },
        key(),
      ),
    );
    await (service(instrumented) as any).processItem(f.batch, f.item);
    expect(
      await db.session.findUnique({ where: { id: f.resourceId } }),
    ).not.toBeNull();
    expect(
      await db.registroSupresion.count({ where: { registroId: f.record.id } }),
    ).toBe(0);
    expect(
      await db.retencionLegal.count({
        where: { registroId: f.record.id, estado: "ACTIVA" },
      }),
    ).toBe(1);
  });
  it("does not execute an item paused between claim and effect or overwrite the pause", async () => {
    const f = await fixture();
    const instrumented = afterClaim(() =>
      service(replica).pauseBatch(
        admin,
        f.batch.id,
        "Synthetic administrative pause",
        key(),
      ),
    );
    await (service(instrumented) as any).processItem(f.batch, f.item);
    await service().processBatch(f.batch.id);
    expect(
      await db.session.findUnique({ where: { id: f.resourceId } }),
    ).not.toBeNull();
    expect(
      (await db.loteSupresion.findUniqueOrThrow({ where: { id: f.batch.id } }))
        .estado,
    ).toBe("PAUSADO");
  });
  it("invalidates an owned claim after freeze/unfreeze without recording a false failure", async () => {
    const f = await fixture();
    const instrumented = afterClaim(async () => {
      await replica.recoveryWriteBarrier.update({
        where: { id: "global" },
        data: { active: true, version: { increment: 1 } },
      });
      await replica.recoveryWriteBarrier.update({
        where: { id: "global" },
        data: { active: false, version: { increment: 1 } },
      });
    });
    await expect(
      (service(instrumented) as any).processItem(f.batch, f.item),
    ).rejects.toMatchObject({ code: "RECOVERY_WRITE_BARRIER_ACTIVE" });
    expect(
      await db.session.findUnique({ where: { id: f.resourceId } }),
    ).not.toBeNull();
    expect(
      (
        await db.elementoLoteSupresion.findUniqueOrThrow({
          where: { id: f.item.id },
        })
      ).estado,
    ).toBe("PROCESANDO");
  });
  it("never revives a lease that expired after its claim", async () => {
    const f = await fixture();
    const instrumented = afterClaim(() =>
      replica.elementoLoteSupresion.update({
        where: { id: f.item.id },
        data: { leaseUntil: new Date(0) },
      }),
    );
    await expect(
      (service(instrumented) as any).processItem(f.batch, f.item),
    ).rejects.toMatchObject({ code: "SUPPRESSION_ITEM_LEASE_LOST" });
    expect(
      await db.session.findUnique({ where: { id: f.resourceId } }),
    ).not.toBeNull();
  });
  it("cannot certify suppression of a still usable session", async () => {
    const f = await fixture(true);
    await service().processBatch(f.batch.id);
    expect(
      await db.session.findUnique({ where: { id: f.resourceId } }),
    ).not.toBeNull();
    expect(
      await db.registroSupresion.count({ where: { registroId: f.record.id } }),
    ).toBe(0);
    expect(
      (
        await db.elementoLoteSupresion.findUniqueOrThrow({
          where: { id: f.item.id },
        })
      ).errorCode,
    ).toBe("RETENTION_RESOURCE_NOT_TERMINAL");
  });
  it("revalidates the batch authority immediately before the destructive effect", async () => {
    const f = await fixture();
    const instrumented = afterClaim(() =>
      replica.usuario.update({
        where: { id: admin.id },
        data: { estado: "SUSPENDIDA" },
      }),
    );
    try {
      await (service(instrumented) as any).processItem(f.batch, f.item);
      expect(
        await db.session.findUnique({ where: { id: f.resourceId } }),
      ).not.toBeNull();
      expect(
        (
          await db.elementoLoteSupresion.findUniqueOrThrow({
            where: { id: f.item.id },
          })
        ).errorCode,
      ).toBe("SUPPRESSION_AUTHORIZATION_REVOKED");
    } finally {
      await replica.usuario.update({
        where: { id: admin.id },
        data: { estado: "ACTIVA" },
      });
    }
  });
  it("orders a successful effect before a concurrently requested freeze", async () => {
    const f = await fixture();
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((r) => {
        entered = r;
      }),
      proceed = new Promise<void>((r) => {
        release = r;
      });
    const pausingAudit = {
      append: async (input: any, tx: any) => {
        if (input.action === "SUPPRESSION_ITEM_EXECUTED") {
          entered();
          await proceed;
        }
        return audit.append(input, tx);
      },
    };
    const effect = (service(db, pausingAudit) as any).processItem(
      f.batch,
      f.item,
    );
    await ready;
    const freeze = replica.recoveryWriteBarrier.update({
      where: { id: "global" },
      data: { active: true, version: { increment: 1 } },
    });
    release();
    await effect;
    await freeze;
    try {
      expect(
        await db.session.findUnique({ where: { id: f.resourceId } }),
      ).toBeNull();
      expect(
        await db.registroSupresion.count({
          where: { registroId: f.record.id },
        }),
      ).toBe(1);
      await expect(service().processBatch(f.batch.id)).rejects.toMatchObject({
        code: "RECOVERY_WRITE_BARRIER_ACTIVE",
      });
    } finally {
      await replica.recoveryWriteBarrier.update({
        where: { id: "global" },
        data: { active: false, version: { increment: 1 } },
      });
    }
  });
  it.skipIf(!endpoint)(
    "reconciles a real immutable MinIO append after an ABA freeze and lease expiry",
    async () => {
      const journalConfig = new ConfigService({
        S3_ENDPOINT: endpoint,
        S3_REGION: "us-east-1",
        S3_FORCE_PATH_STYLE: true,
        S3_ACCESS_KEY: "ares-local",
        S3_SECRET_KEY: "ares-local-secret",
        S3_QUARANTINE_BUCKET: "ares-quarantine",
        S3_AVAILABLE_BUCKET: "ares-available",
        S3_PUBLIC_BUCKET: "ares-public",
        S3_SUPPRESSION_JOURNAL_BUCKET: "ares-suppression-journal",
        SUPPRESSION_JOURNAL_HMAC_SECRET:
          "synthetic-safety-journal-key-not-for-production-2026",
        SUPPRESSION_JOURNAL_KEY_VERSION: "safety-v1",
        SUPPRESSION_JOURNAL_WORKER_ENABLED: false,
      });
      const storage = new S3Storage(journalConfig as any);
      // Consume only entries in this isolated DB, never the application's queue.
      await new SuppressionJournalWorker(
        db,
        storage,
        journalConfig as any,
      ).tick(100);
      const f = await fixture();
      await service().processBatch(f.batch.id);
      const entry = await db.suppressionJournalEntry.findFirstOrThrow({
        where: { registroSupresion: { registroId: f.record.id } },
      });
      const delayedStorage = new Proxy(storage, {
        get(target, property) {
          if (property === "putSuppressionJournal")
            return async (name: string, body: Buffer) => {
              await target.putSuppressionJournal(name, body);
              await replica.recoveryWriteBarrier.update({
                where: { id: "global" },
                data: { active: true, version: { increment: 1 } },
              });
              await replica.recoveryWriteBarrier.update({
                where: { id: "global" },
                data: { active: false, version: { increment: 1 } },
              });
            };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      expect(
        await new SuppressionJournalWorker(
          db,
          delayedStorage,
          journalConfig as any,
        ).tick(1),
      ).toBe(0);
      expect(
        (
          await db.suppressionJournalEntry.findUniqueOrThrow({
            where: { id: entry.id },
          })
        ).state,
      ).toBe("PROCESSING");
      await replica.suppressionJournalEntry.update({
        where: { id: entry.id },
        data: { leaseUntil: new Date(0) },
      });
      expect(
        await new SuppressionJournalWorker(
          replica,
          storage,
          journalConfig as any,
        ).tick(1),
      ).toBe(1);
      const completed = await db.suppressionJournalEntry.findUniqueOrThrow({
        where: { id: entry.id },
      });
      expect(completed).toMatchObject({
        state: "EXPORTED",
        attempts: 2,
        leaseOwner: null,
        leaseUntil: null,
      });
      const bytes: Buffer[] = [];
      for await (const chunk of await storage.getSuppressionJournal(
        completed.storageRef!,
      ))
        bytes.push(Buffer.from(chunk));
      const { signature, ...envelope } = JSON.parse(
        Buffer.concat(bytes).toString(),
      );
      expect(
        verifyJournalEnvelope(
          envelope,
          signature,
          journalConfig.getOrThrow<string>("SUPPRESSION_JOURNAL_HMAC_SECRET"),
        ),
      ).toBe(true);
      expect(JSON.stringify(envelope.payload)).not.toContain(f.resourceId);
      expect(
        await db.registroSupresion.count({
          where: { registroId: f.record.id },
        }),
      ).toBe(1);
    },
  );
});
