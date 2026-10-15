import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { Prisma } from "../../src/generated/prisma/client";
import { UsersRepository } from "../../src/users/users.repository";
import {
  historicalDuty,
  recordOperationalHistory,
} from "../../src/common/domain/operational-history";
import { runtimeGrants } from "../../src/scripts/provision-runtime-db";
import { VisitsService } from "../../src/visits/visits.service";
import { DomainTransaction } from "../../src/common/domain/domain-transaction";
import { AuditService } from "../../src/auth/audit.service";
import { suppressOperationalEvidence } from "../../src/retention/operational-evidence";
import { InventoryCheckWorker } from "../../src/inventory/inventory-check.worker";

const url = process.env.DATABASE_URL;
if (!url || !/_(test|ci)$/.test(new URL(url).pathname))
  throw new Error(
    "Hardening integration needs a dedicated _test or _ci DATABASE_URL",
  );
const db = new PrismaService(new ConfigService({ DATABASE_URL: url }));
const adminUrl = process.env.DB_ADMIN_URL ?? url;
if (
  new URL(adminUrl!).host !== new URL(url!).host ||
  new URL(adminUrl!).pathname !== new URL(url!).pathname
)
  throw new Error("Integration admin must target the same isolated database");
const admin = new PrismaService(new ConfigService({ DATABASE_URL: adminUrl }));
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
let sedeId: number, areaId: number, turnoId: number;
let owner: any, host: any;
const historyDate = new Date("2026-09-01T00:00:00Z");
const key1 = "original-dedicated-visit-key-32-characters";
const key2 = "rotated-dedicated-visit-key-32-characters";
const audit = new AuditService(db);
const config = new ConfigService({
  VISITS_ENABLED: true,
  VISITS_TOKEN_KEY: key1,
});
const visits = new VisitsService(db, new DomainTransaction(db), audit, config);
const visitIds: string[] = [];
let runtime: PrismaService | undefined;
const runtimeName = `ares_runtime_${suffix}`;
// The CI container sees the host bridge address, not 127.0.0.1. This account
// exists only for this guarded disposable database and is removed in afterAll.
const runtimeHost = "%";
describe("acceptance hardening on MariaDB", () => {
  beforeAll(async () => {
    sedeId = (await db.sede.create({ data: { nombre: `hardening-${suffix}` } }))
      .id;
    areaId = (
      await db.area.create({ data: { sedeId, nombre: `hardening-${suffix}` } })
    ).id;
    turnoId = (
      await db.turno.create({
        data: {
          nombre: "Historical",
          areaId,
          horaInicio: new Date("1970-01-01T08:00:00Z"),
          horaFin: new Date("1970-01-01T12:00:00Z"),
          dias: { create: [{ dia: "VIERNES" }] },
        },
      })
    ).id;
    owner = await db.usuario.create({
      data: {
        codigo: `hardening-owner-${suffix}`,
        email: `owner-${suffix}@example.test`,
        passwordHash: "synthetic-non-login",
        rol: "PRESTADOR",
        estado: "ACTIVA",
        sedeId,
        areaId,
        turnoId,
      },
    });
    host = await db.usuario.create({
      data: {
        codigo: `hardening-host-${suffix}`,
        email: `host-${suffix}@example.test`,
        passwordHash: "synthetic-non-login",
        rol: "COORDINADOR",
        estado: "ACTIVA",
        sedeId,
        areaId,
        turnoId,
      },
    });
    await db.$transaction(async (tx) => {
      for (const [type, id] of [
        ["USER", owner.id],
        ["USER", host.id],
        ["SHIFT", turnoId],
        ["AREA", areaId],
        ["SEDE", sedeId],
      ] as const)
        await recordOperationalHistory(tx, type, id);
      await tx.operationalHistory.updateMany({
        where: {
          OR: [
            { resourceType: "USER", resourceId: { in: [owner.id, host.id] } },
            { resourceType: "SHIFT", resourceId: turnoId },
            { resourceType: "AREA", resourceId: areaId },
            { resourceType: "SEDE", resourceId: sedeId },
          ],
        },
        data: { recordedAt: historyDate },
      });
    });
  });
  afterAll(async () => {
    await runtime?.$disconnect();
    await admin.$executeRawUnsafe(
      `DROP USER IF EXISTS '${runtimeName}'@'${runtimeHost}'`,
    );
    await db.domainOperation.deleteMany({ where: { actorId: host?.id ?? -1 } });
    await db.invitacionVisita.deleteMany({ where: { id: { in: visitIds } } });
    await db.notification.deleteMany({
      where: { userId: { in: [owner?.id ?? -1, host?.id ?? -1] } },
    });
    await db.usuario.deleteMany({
      where: { id: { in: [owner?.id ?? -1, host?.id ?? -1] } },
    });
    if (turnoId) await db.turno.delete({ where: { id: turnoId } });
    if (areaId) await db.area.delete({ where: { id: areaId } });
    if (sedeId) await db.sede.delete({ where: { id: sedeId } });
    await db.$disconnect();
    await admin.$disconnect();
  });
  it("a suspension today preserves the actual historical duty, not current status", async () => {
    const users = new UsersRepository(db, audit, {
      enqueue: async () => ({}),
    } as any);
    await users.update(owner.id, { estado: "SUSPENDIDA" }, host.id);
    const duty = await db.$transaction((tx) =>
      historicalDuty(tx, owner.id, "2026-10-09"),
    );
    expect(duty).toMatchObject({
      eligible: true,
      isShiftDay: true,
      sedeId,
      areaId,
      turnoId,
    });
    expect(
      await db.$transaction((tx) => historicalDuty(tx, owner.id, "2026-08-01")),
    ).toMatchObject({ reason: "ASSIGNMENT_HISTORY_UNKNOWN" });
  });
  it("audit failure rolls back both identity and appended operational history", async () => {
    const count = await db.operationalHistory.count({
      where: { resourceType: "USER", resourceId: owner.id },
    });
    const users = new UsersRepository(
      db,
      {
        append: async () => {
          throw new Error("synthetic audit failure");
        },
      } as any,
      { enqueue: async () => ({}) } as any,
    );
    await expect(
      users.update(owner.id, { estado: "ACTIVA" }, host.id),
    ).rejects.toThrow("synthetic audit failure");
    expect(
      (await db.usuario.findUnique({ where: { id: owner.id } }))?.estado,
    ).toBe("SUSPENDIDA");
    expect(
      await db.operationalHistory.count({
        where: { resourceType: "USER", resourceId: owner.id },
      }),
    ).toBe(count);
  });
  it("keyring rotation preserves old host recovery; retirement denies lookup and entry", async () => {
    const from = new Date(Date.now() - 60000),
      until = new Date(Date.now() + 3600000);
    const fechaProgramada = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(from);
    const created = (await visits.create(host, `visit-${suffix}`, {
      sedeId,
      areaId,
      nombreVisitante: "Synthetic private visitor",
      motivo: "Ensayo integral",
      fechaProgramada,
      validaDesde: from.toISOString(),
      validaHasta: until.toISOString(),
    })) as any;
    visitIds.push(created.id);
    config.set(
      "VISITS_TOKEN_KEYRING",
      JSON.stringify({ legacy: key1, v2: key2 }),
    );
    config.set("VISITS_TOKEN_ACTIVE_VERSION", "v2");
    const listed = await visits.list(host, { mine: "true", limit: 100 });
    expect(listed.items.find((row) => row.id === created.id)?.code).toBe(
      created.code,
    );
    await expect(visits.check(host, created.code)).resolves.toMatchObject({
      id: created.id,
    });
    config.set("VISITS_TOKEN_KEYRING", JSON.stringify({ v2: key2 }));
    await expect(visits.check(host, created.code)).rejects.toMatchObject({
      code: "VISIT_NOT_FOUND",
    });
    await expect(
      visits.act(host, created.id, `retired-${suffix}`, "ENTRY", {
        version: 1,
        identificacionVerificada: true,
      }),
    ).rejects.toMatchObject({ code: "VISIT_KEY_RETIRED" });
    config.set(
      "VISITS_TOKEN_KEYRING",
      JSON.stringify({ legacy: key1, v2: key2 }),
    );
    await visits.act(host, created.id, `cancel-${suffix}`, "CANCEL", {
      version: 1,
      reason: "Cancelación de ensayo",
    });
  });
  it("suppression redacts replay receipts and old QR lookup without deleting the visit ledger", async () => {
    const id = visitIds[0];
    const row = await db.invitacionVisita.findUniqueOrThrow({ where: { id } });
    await suppressOperationalEvidence(db, {} as any, "VisitEvidence", id);
    const receipts = await db.domainOperation.findMany({
      where: { actorId: host.id },
    });
    expect(JSON.stringify(receipts)).not.toContain("Synthetic private visitor");
    expect(
      (await db.invitacionVisita.findUniqueOrThrow({ where: { id } }))
        .nombreVisitante,
    ).toBe("[SUPRIMIDO]");
    expect(
      (await db.invitacionVisita.findUniqueOrThrow({ where: { id } })).estado,
    ).toBe(row.estado);
    const replay = (await visits.create(host, `visit-${suffix}`, {
      sedeId,
      areaId,
      nombreVisitante: "Synthetic private visitor",
      motivo: "Ensayo integral",
      fechaProgramada: row.fechaProgramada.toISOString().slice(0, 10),
      validaDesde: row.validaDesde.toISOString(),
      validaHasta: row.validaHasta.toISOString(),
    })) as any;
    expect(replay.code).toBeUndefined();
    expect(replay.nombreVisitante).toBe("[SUPRIMIDO]");
  });
  it("a genuine runtime account cannot update/delete ledgers, perform DDL or read migrations", async () => {
    const password = `Acceptance_Runtime_${suffix}_SecurePassword32`;
    const parsed = new URL(url!);
    await admin.$executeRawUnsafe(
      `CREATE USER '${runtimeName}'@'${runtimeHost}' IDENTIFIED BY '${password}'`,
    );
    const tables = await db.$queryRaw<
      { TABLE_NAME: string }[]
    >`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ${parsed.pathname.slice(1)} AND TABLE_TYPE = 'BASE TABLE'`;
    for (const grant of runtimeGrants(
      parsed.pathname.slice(1),
      runtimeName,
      runtimeHost,
      tables.map((t) => t.TABLE_NAME),
    ))
      await admin.$executeRawUnsafe(grant);
    parsed.username = runtimeName;
    parsed.password = password;
    runtime = new PrismaService(
      new ConfigService({ DATABASE_URL: parsed.toString() }),
    );
    await expect(
      runtime.$executeRaw`UPDATE MovimientoInventario SET motivo = 'illegal' WHERE id = 'nonexistent'`,
    ).rejects.toThrow();
    await expect(
      runtime.$executeRaw`DELETE FROM OperationalHistory WHERE resourceId = -1`,
    ).rejects.toThrow();
    await expect(
      runtime.$executeRaw`DELETE FROM AuditEvent WHERE id = 'nonexistent'`,
    ).rejects.toThrow();
    await expect(
      runtime.$executeRawUnsafe("CREATE TABLE forbidden_runtime_ddl (id INT)"),
    ).rejects.toThrow();
    await expect(
      runtime.$queryRaw`SELECT id FROM _prisma_migrations LIMIT 1`,
    ).rejects.toThrow();
    expect(
      await runtime.usuario.findUnique({ where: { id: host.id } }),
    ).toBeTruthy();
    await runtime.operationalHistory.create({
      data: { resourceType: "TEST", resourceId: -1, snapshot: {} },
    });
  });
  it("absence suppression redacts durable replays without changing decisions", async () => {
    const absence = await db.ausencia.create({
      data: {
        userId: owner.id,
        sedeId,
        areaId,
        turnoId,
        fecha: new Date("2026-09-11"),
        plazoLimiteAt: new Date("2026-09-18"),
        estado: "JUSTIFICADA",
        motivoResolucion: "Synthetic confidential resolution",
      },
    });
    const key = `absence-private-${suffix}`;
    try {
      const written = await db.justificacionAusencia.create({
        data: {
          ausenciaId: absence.id,
          motivo: "Synthetic confidential narrative",
          solicitadoPor: owner.id,
        },
      });
      await db.absenceOperation.create({
        data: {
          actorId: owner.id,
          key,
          fingerprint: "a".repeat(64),
          response: {
            id: absence.id,
            motivoResolucion: absence.motivoResolucion,
            estado: absence.estado,
            justificaciones: [{ id: written.id, motivo: written.motivo }],
          },
        },
      });
      await suppressOperationalEvidence(
        db,
        {} as any,
        "AbsenceEvidence",
        absence.id,
      );
      const receipt = await db.absenceOperation.findUniqueOrThrow({
        where: { actorId_key: { actorId: owner.id, key } },
      });
      expect(JSON.stringify(receipt.response)).not.toContain(
        "Synthetic confidential",
      );
      expect(
        (await db.ausencia.findUniqueOrThrow({ where: { id: absence.id } }))
          .estado,
      ).toBe("JUSTIFICADA");
      await suppressOperationalEvidence(
        db,
        {} as any,
        "AbsenceEvidence",
        absence.id,
      );
    } finally {
      await db.absenceOperation.deleteMany({
        where: { actorId: owner.id, key },
      });
      await db.justificacionAusencia.deleteMany({
        where: { ausenciaId: absence.id },
      });
      await db.ausencia.delete({ where: { id: absence.id } });
    }
  });
  it("periodic stock verification raises one alert without silently repairing balances", async () => {
    const location = await db.ubicacionInventario.create({
      data: { sedeId, areaId, codigo: suffix, nombre: "Synthetic" },
    });
    const item = await db.articuloInventario.create({
      data: {
        ubicacionId: location.id,
        codigo: `mismatch-${suffix}`,
        nombre: "Synthetic",
        tipo: "CONSUMIBLE",
        unidadMedida: "pieza",
        cantidadStock: new Prisma.Decimal("1"),
      },
    });
    const worker = new InventoryCheckWorker(db, new ConfigService(), audit);
    try {
      await worker.check(1000);
      await worker.check(1000);
      expect(
        await db.operationalAlert.count({
          where: {
            source: `inventory:${item.id}`,
            code: "INVENTORY_LEDGER_MISMATCH",
          },
        }),
      ).toBe(1);
      expect(
        (
          await db.articuloInventario.findUniqueOrThrow({
            where: { id: item.id },
          })
        ).cantidadStock.toString(),
      ).toBe("1");
    } finally {
      await db.operationalAlert.deleteMany({
        where: { source: `inventory:${item.id}` },
      });
      await db.articuloInventario.delete({ where: { id: item.id } });
      await db.ubicacionInventario.delete({ where: { id: location.id } });
    }
  });
});
