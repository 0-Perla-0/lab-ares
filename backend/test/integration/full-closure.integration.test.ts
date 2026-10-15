import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { AuthThrottleService } from "../../src/auth/auth-throttle.service";
import { AuditService } from "../../src/auth/audit.service";
import { OutboxService } from "../../src/auth/outbox.service";
import { UsersPolicy } from "../../src/users/users.policy";
import { AdministrativeRecoveryService } from "../../src/users/administrative-recovery.service";
import { operationalNotification } from "../../src/common/domain/operational-notification";
import { FeaturePoliciesService } from "../../src/common/domain/feature-policies.service";
import { ReportsService } from "../../src/reports/reports.service";
import { queueObservability } from "../../src/operations/queue-observability";

const url = process.env.DATABASE_URL;
if (!url || !/_(test|ci)$/.test(new URL(url).pathname))
  throw new Error(
    "Closure integration requires an isolated _test or _ci database",
  );
const db = new PrismaService(new ConfigService({ DATABASE_URL: url }));
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const config = new ConfigService({
  SESSION_SECRET: "closure-integration-only-32-character-secret",
  OUTBOX_ENCRYPTION_KEY: "closure-integration-only-encryption-key",
  VISITS_ENABLED: true,
});
const audit = new AuditService(db);
const outbox = new OutboxService(db, config as any);
let actor: any, target: any, other: any, areaId: number, sedeId: number;
const recovery = new AdministrativeRecoveryService(
  db,
  new UsersPolicy({} as any),
  outbox,
  audit,
);
describe("full closure concurrent MariaDB boundaries", () => {
  beforeAll(async () => {
    sedeId = (await db.sede.create({ data: { nombre: `closure-${suffix}` } }))
      .id;
    areaId = (await db.area.create({ data: { nombre: "closure", sedeId } })).id;
    const create = (kind: string, rol: "ADMIN" | "PRESTADOR") =>
      db.usuario.create({
        data: {
          codigo: `closure-${kind}-${suffix}`,
          email: `closure-${kind}-${suffix}@example.test`,
          passwordHash: "synthetic-non-login",
          rol,
          estado: "ACTIVA",
          sedeId,
          areaId,
        },
      });
    actor = await create("admin", "ADMIN");
    target = await create("target", "PRESTADOR");
    other = await create("authority", "ADMIN");
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  it("reads queue states without payloads, identifiers or false delivery claims", async () => {
    const result = await queueObservability(db);
    expect(result.semantics).toContain("not delivery");
    expect(JSON.stringify(result)).not.toMatch(
      /passwordHash|tokenHash|secretCiphertext|notificationId/,
    );
    expect(
      result.queues.every(
        (row) => Number.isInteger(row.depth) && row.depth >= 0,
      ),
    ).toBe(true);
  });
  it("rolls back notifications together with the business mutation and outbox", async () => {
    const before = await db.notification.count({
      where: { userId: target.id },
    });
    await expect(
      db.$transaction(async (tx) => {
        await operationalNotification(
          tx,
          target.id,
          "ABSENCE_PROVISIONAL_CREATED",
          {
            ausenciaId: "rollback-fixture",
            plazoLimiteAt: new Date().toISOString(),
          },
        );
        throw new Error("forced rollback");
      }),
    ).rejects.toThrow("forced rollback");
    expect(await db.notification.count({ where: { userId: target.id } })).toBe(
      before,
    );
  });
  it("shares network limits between independent replicas without lost updates", async () => {
    const first = new AuthThrottleService(db, config),
      second = new AuthThrottleService(db, config);
    const address = `synthetic-${suffix}`;
    const now = new Date("2026-10-12T10:00:00Z");
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        (i % 2 ? first : second).consumeNetwork("/login", address, now),
      ),
    );
    await expect(
      second.consumeNetwork("/login", address, now),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(
      first.consumeNetwork("/login", address, new Date(now.getTime() + 60001)),
    ).resolves.toBeUndefined();
  });
  it("locks after ten failures, alerts once, contains no raw account/network keys and clears on full authentication", async () => {
    const first = new AuthThrottleService(db, config),
      second = new AuthThrottleService(db, config);
    const now = new Date("2026-10-12T11:00:00Z");
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        (i % 2 ? first : second).failure(target.email, now),
      ),
    );
    await expect(
      first.assertAccount(target.email, new Date(now.getTime() + 899999)),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(
      second.assertAccount(target.email, new Date(now.getTime() + 900001)),
    ).resolves.toBeUndefined();
    expect(
      await db.notification.count({
        where: { userId: target.id, type: "IDENTITY_TEMPORARILY_THROTTLED" },
      }),
    ).toBe(1);
    const rows = await db.authThrottle.findMany();
    expect(JSON.stringify(rows)).not.toContain(target.email);
    expect(rows.every((row) => /^[a-f0-9]{64}$/.test(row.key))).toBe(true);
    await second.success(target.email);
    await expect(
      first.assertAccount(target.email, now),
    ).resolves.toBeUndefined();
  });
  it("administrative recovery replays once without exposing tokens or storing a replacement password", async () => {
    await db.session.create({
      data: {
        id: `closure-${suffix}`,
        userId: target.id,
        data: {},
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const input = {
      identityVerified: true as const,
      ticket: `closure-${suffix}`,
      reason: "Institutional identity procedure completed",
      resetMfa: true,
    };
    const key = `recovery-${suffix}`;
    const results = await Promise.all([
      recovery.recover(actor, target.id, key, input),
      recovery.recover(actor, target.id, key, input),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(JSON.stringify(results)).not.toMatch(
      /token|passwordHash|secretCiphertext/,
    );
    expect(
      await db.recoveryToken.count({
        where: { userId: target.id, usedAt: null },
      }),
    ).toBe(1);
    expect(
      (
        await db.session.findUniqueOrThrow({
          where: { id: `closure-${suffix}` },
        })
      ).revokedAt,
    ).not.toBeNull();
    expect(
      (await db.usuario.findUniqueOrThrow({ where: { id: target.id } }))
        .passwordHash,
    ).toBe("synthetic-non-login");
    await expect(
      recovery.recover(actor, actor.id, "self-recovery", input),
    ).rejects.toMatchObject({ code: "SELF_RECOVERY_NOT_ALLOWED" });
  });
  it("rolls back administrative identity change if transactional outbox fails", async () => {
    const failing = new AdministrativeRecoveryService(
      db,
      new UsersPolicy({} as any),
      {
        enqueue: async () => {
          throw new Error("outbox unavailable");
        },
      } as any,
      audit,
    );
    await expect(
      failing.recover(actor, target.id, `rollback-${suffix}`, {
        identityVerified: true,
        ticket: "TKT-rollback",
        reason: "Explicit rollback test procedure",
        resetMfa: false,
        email: `rollback-${suffix}@example.test`,
      }),
    ).rejects.toThrow("outbox unavailable");
    expect(
      (await db.usuario.findUniqueOrThrow({ where: { id: target.id } })).email,
    ).toBe(target.email);
  });
  it("publishes only one feature version under concurrent authorities and audits exactly once", async () => {
    const policies = new FeaturePoliciesService(db, config);
    const key = "VISITS.REQUEST";
    const current = await db.featurePolicy.findUnique({
      where: { module: key },
    });
    const input = {
      expectedVersion: current?.version ?? 0,
      enabled: true,
      sedeIds: [sedeId],
      areaIds: [areaId],
      userIds: [target.id],
      reason: "Synthetic acceptance policy, not production activation",
    };
    const results = await Promise.allSettled([
      policies.publish(actor, key, `flag-1-${suffix}`, input),
      policies.publish(other, key, `flag-2-${suffix}`, input),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      (await db.featurePolicy.findUniqueOrThrow({ where: { module: key } }))
        .version,
    ).toBe(input.expectedVersion + 1);
    expect((await policies.capabilities(target))[key]).toBe(true);
    expect((await policies.capabilities(actor))[key]).toBe(false);
    // Restore the test-only policy without touching audit or operational ledgers.
    const next = await db.featurePolicy.findUniqueOrThrow({
      where: { module: key },
    });
    await policies.publish(actor, key, `flag-restore-${suffix}`, {
      ...input,
      expectedVersion: next.version,
      sedeIds: [],
      areaIds: [],
      userIds: [],
    });
  });
  it("exports historical absences after transfer/deactivation without exposing narratives", async () => {
    const when = new Date("2026-10-01T00:00:00Z");
    await db.ausencia.create({
      data: {
        userId: target.id,
        sedeId,
        areaId,
        turnoId: 1,
        fecha: when,
        plazoLimiteAt: new Date("2026-10-10T00:00:00Z"),
        motivoResolucion: "private narrative",
        estado: "JUSTIFICADA",
      },
    });
    await db.usuario.update({
      where: { id: target.id },
      data: { estado: "DESACTIVADA", sedeId: null, areaId: null },
    });
    const reports = new ReportsService(db, audit, {} as any);
    const coordinator = await db.usuario.create({
      data: {
        codigo: `closure-report-${suffix}`,
        email: `closure-report-${suffix}@example.test`,
        passwordHash: "synthetic-non-login",
        rol: "COORDINADOR",
        estado: "ACTIVA",
        sedeId,
        areaId,
      },
    });
    const result = await reports.requestExport(coordinator, {
      type: "ABSENCES",
      from: "2026-10-01",
      to: "2026-10-02",
    });
    expect(result.sync).toBe(true);
    if (!result.sync) throw new Error("Expected synchronous CSV");
    expect(result.body.toString()).toContain(String(target.id));
    expect(result.body.toString()).not.toContain("private narrative");
    const anotherArea = await db.area.create({
      data: { nombre: "closure-other-report-area", sedeId },
    });
    const outsideActor = await db.usuario.create({
      data: {
        codigo: `closure-outside-${suffix}`,
        email: `closure-outside-${suffix}@example.test`,
        passwordHash: "synthetic-non-login",
        rol: "COORDINADOR",
        estado: "ACTIVA",
        sedeId,
        areaId: anotherArea.id,
      },
    });
    const outside = await reports.requestExport(outsideActor, {
      type: "ABSENCES",
      from: "2026-10-01",
      to: "2026-10-02",
    });
    if (outside.sync)
      expect(outside.body.toString()).not.toContain("JUSTIFICADA");
  });
});
