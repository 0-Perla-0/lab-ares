import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { PrismaService } from "../../src/database/prisma.service";
import { AuditService } from "../../src/auth/audit.service";
import type { AuthUser } from "../../src/auth/auth-user";
import { DomainTransaction } from "../../src/common/domain/domain-transaction";
import { VisitsService } from "../../src/visits/visits.service";
import { InventoryService } from "../../src/inventory/inventory.service";
import { AttendanceReviewService } from "../../src/attendance/attendance-review.service";
import { AttendanceService } from "../../src/attendance/attendance.service";
import { AttendancePolicy } from "../../src/attendance/attendance.policy";
import { OperationsService } from "../../src/operations/operations.service";
import { localParts } from "../../src/attendance/attendance-risk";
config({ path: [".env", "../.env"], quiet: true });
const url = process.env.DATABASE_URL;
if (!url || !/_(test|ci)$/.test(new URL(url).pathname))
  throw new Error(
    "Operational integration requires a dedicated _test or _ci database",
  );
const settings = new ConfigService({
  DATABASE_URL: url,
  VISITS_ENABLED: true,
  INVENTORY_ENABLED: true,
  VISITS_TOKEN_KEY: "synthetic-visits-key-32-bytes-not-production",
  ATTENDANCE_ALERT_HOURS: 12,
});
const prisma = new PrismaService(settings);
const writes = new DomainTransaction(prisma),
  audit = new AuditService(prisma);
const inventory = new InventoryService(prisma, writes, audit, settings);
const visits = new VisitsService(prisma, writes, audit, settings);
const review = new AttendanceReviewService(
  prisma,
  new AttendancePolicy(),
  audit,
);
const attendance = new AttendanceService(
  prisma,
  new AttendancePolicy(),
  settings,
  audit,
);
const prefix = `operational-${randomUUID().slice(0, 8)}`;
let admin: AuthUser,
  coordinator: AuthUser,
  authority: AuthUser,
  owner: AuthUser;
let sedeId: number, areaId: number, locationId: number;
let sequence = 0;
const key = () => `operational-key-${prefix}-${++sequence}`;
async function item(tipo: "CONSUMIBLE" | "ACTIVO") {
  return (await inventory.createItem(admin, key(), {
    codigo: `${prefix}-${++sequence}`,
    nombre: "Synthetic item",
    tipo,
    ubicacionId: locationId,
    ...(tipo === "CONSUMIBLE" ? { unidadMedida: "kg", umbralMinimo: 1 } : {}),
    reason: "Synthetic initial receipt",
  })) as any;
}
async function invitation() {
  const now = new Date();
  return (await visits.create(admin, key(), {
    sedeId,
    areaId,
    nombreVisitante: "Synthetic visitor",
    motivo: "Synthetic laboratory visit",
    fechaProgramada: localParts(now).day,
    validaDesde: new Date(+now - 60000).toISOString(),
    validaHasta: new Date(+now + 3600000).toISOString(),
  })) as any;
}
function contingencyInput() {
  return {
    userId: owner.id,
    date: "2026-10-08",
    checkInAt: "2026-10-08T15:00:00Z",
    checkOutAt: "2026-10-08T17:00:00Z",
    ticket: "SYNTHETIC-OUTAGE-123",
    reason: "Synthetic network outage",
    justification:
      "Private synthetic narrative, not copied to ordinary responses",
  };
}
describe("operational phases on real MariaDB", () => {
  beforeAll(async () => {
    sedeId = (await prisma.sede.create({ data: { nombre: prefix } })).id;
    areaId = (await prisma.area.create({ data: { nombre: prefix, sedeId } }))
      .id;
    const turnoId = (
      await prisma.turno.create({
        data: {
          nombre: prefix,
          areaId,
          horaInicio: new Date("1970-01-01T08:00:00Z"),
          horaFin: new Date("1970-01-01T18:00:00Z"),
          dias: { create: [{ dia: "JUEVES" }] },
        },
      })
    ).id;
    const actors: AuthUser[] = [];
    for (const rol of [
      "ADMIN",
      "COORDINADOR",
      "JEFE_AREA",
      "PRESTADOR",
    ] as const)
      actors.push(
        await prisma.usuario.create({
          data: {
            codigo: `${prefix}-${rol}`,
            email: `${prefix}-${rol}@example.test`,
            passwordHash: "synthetic-non-login-fixture",
            rol,
            estado: "ACTIVA",
            sedeId,
            areaId,
            turnoId,
          },
        }),
      );
    [admin, coordinator, authority, owner] = actors;
    locationId = (
      (await inventory.createLocation(admin, key(), {
        sedeId,
        areaId,
        nombre: "Synthetic location",
        codigo: prefix,
        reason: "Synthetic initial location",
      })) as any
    ).id;
  });
  // Leave append-only synthetic audit/ledger fixtures in the dedicated disposable database.
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it("concurrent stock exits cannot overdraw and balance always equals ledger", async () => {
    const row = await item("CONSUMIBLE");
    await inventory.movement(admin, key(), {
      articuloId: row.id,
      version: 1,
      tipo: "ENTRADA",
      cantidad: 10.25,
      motivo: "Synthetic initial stock",
    });
    const results = await Promise.allSettled([
      inventory.movement(admin, key(), {
        articuloId: row.id,
        version: 2,
        tipo: "SALIDA",
        cantidad: 8,
        motivo: "Synthetic exit one",
      }),
      inventory.movement(authority, key(), {
        articuloId: row.id,
        version: 2,
        tipo: "SALIDA",
        cantidad: 8,
        motivo: "Synthetic exit two",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const persisted = await prisma.articuloInventario.findUniqueOrThrow({
      where: { id: row.id },
    });
    const ledger = await prisma.movimientoInventario.aggregate({
      where: { articuloId: row.id },
      _sum: { cantidad: true },
    });
    expect(persisted.cantidadStock.toString()).toBe("2.25");
    expect(ledger._sum.cantidad?.eq(persisted.cantidadStock)).toBe(true);
  });
  it("same-key stock retry records exactly one movement; different payload is rejected", async () => {
    const row = await item("CONSUMIBLE"),
      requestKey = key();
    const input = {
      articuloId: row.id,
      version: 1,
      tipo: "ENTRADA" as const,
      cantidad: 2.5,
      motivo: "Synthetic receipt",
    };
    const [a, b] = await Promise.all([
      inventory.movement(admin, requestKey, input),
      inventory.movement(admin, requestKey, input),
    ]);
    expect(a).toEqual(b);
    expect(
      await prisma.movimientoInventario.count({
        where: { articuloId: row.id },
      }),
    ).toBe(1);
    await expect(
      inventory.movement(admin, requestKey, { ...input, cantidad: 3 }),
    ).rejects.toMatchObject({ response: { error: "IDEMPOTENCY_KEY_REUSED" } });
  });
  it("competing loans and returns affect one asset exactly once", async () => {
    const row = await item("ACTIVO");
    const input = {
      articuloId: row.id,
      version: 1,
      solicitanteId: owner.id,
      fechaLimite: "2099-10-20T18:00:00Z",
      motivo: "Synthetic equipment loan",
    };
    const results = await Promise.allSettled([
      inventory.loan(admin, key(), input),
      inventory.loan(authority, key(), input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loan = await prisma.prestamoInventario.findFirstOrThrow({
      where: { articuloId: row.id },
    });
    const returned = await Promise.allSettled([
      inventory.returnLoan(admin, loan.id, key(), {
        estadoFisico: "DANIADO",
        motivo: "Synthetic damaged return",
      }),
      inventory.returnLoan(authority, loan.id, key(), {
        estadoFisico: "DISPONIBLE",
        motivo: "Synthetic competing return",
      }),
    ]);
    expect(returned.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.movimientoInventario.count({
        where: { articuloId: row.id, tipo: "DEVOLUCION" },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.articuloInventario.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).cantidadStock.toString(),
    ).toBe("1");
  });
  it("ledger mismatch fails closed instead of overwriting history", async () => {
    const row = await item("CONSUMIBLE");
    await prisma.articuloInventario.update({
      where: { id: row.id },
      data: { cantidadStock: 10 },
    });
    await expect(
      inventory.movement(admin, key(), {
        articuloId: row.id,
        version: 1,
        tipo: "AJUSTE",
        cantidad: -1,
        motivo: "Synthetic recount",
      }),
    ).rejects.toMatchObject({
      response: { error: "INVENTORY_LEDGER_MISMATCH" },
    });
    expect(
      await prisma.movimientoInventario.count({
        where: { articuloId: row.id },
      }),
    ).toBe(0);
  });
  it("audit failure rolls back movement, materialized stock and replay identity", async () => {
    const row = await item("CONSUMIBLE"),
      requestKey = key();
    const failing = new InventoryService(
      prisma,
      writes,
      {
        append: async () => {
          throw new Error("synthetic-audit-failure");
        },
      } as any,
      settings,
    );
    await expect(
      failing.movement(admin, requestKey, {
        articuloId: row.id,
        version: 1,
        tipo: "ENTRADA",
        cantidad: 1,
        motivo: "Synthetic rollback test",
      }),
    ).rejects.toThrow("synthetic-audit-failure");
    expect(
      (
        await prisma.articuloInventario.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).cantidadStock.toString(),
    ).toBe("0");
    expect(
      await prisma.movimientoInventario.count({
        where: { articuloId: row.id },
      }),
    ).toBe(0);
    expect(
      await prisma.domainOperation.findUnique({
        where: { actorId_key: { actorId: admin.id, key: requestKey } },
      }),
    ).toBeNull();
  });
  it("invitation stores only a hash, has no visitor account, and requires staff verification", async () => {
    const row = await invitation();
    const persisted = await prisma.invitacionVisita.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(persisted.codigoAcceso).not.toBe(row.code);
    expect(
      JSON.stringify(
        await prisma.domainOperation.findMany({ where: { actorId: admin.id } }),
      ),
    ).not.toContain(row.code);
    const looked = await visits.check(coordinator, row.code);
    expect(looked).not.toHaveProperty("code");
    expect(looked).not.toHaveProperty("codigoAcceso");
    await expect(
      visits.act(coordinator, row.id, key(), "ENTRY", { version: 1 }),
    ).rejects.toMatchObject({ response: { error: "VISIT_IDENTITY_REQUIRED" } });
    await visits.act(coordinator, row.id, key(), "ENTRY", {
      version: 1,
      identificacionVerificada: true,
    });
    await prisma.invitacionVisita.update({
      where: { id: row.id },
      data: { validaHasta: new Date("2020-01-01") },
    });
    await visits.act(coordinator, row.id, key(), "EXIT", { version: 2 });
    expect(
      (
        await prisma.invitacionVisita.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).estado,
    ).toBe("REGISTRADA_SALIDA");
  });
  it("expired invitations cannot admit visitors and competing entries only admit once", async () => {
    const row = await invitation();
    const results = await Promise.allSettled([
      visits.act(coordinator, row.id, key(), "ENTRY", {
        version: 1,
        identificacionVerificada: true,
      }),
      visits.act(authority, row.id, key(), "ENTRY", {
        version: 1,
        identificacionVerificada: true,
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const expired = await invitation();
    await prisma.invitacionVisita.update({
      where: { id: expired.id },
      data: { validaHasta: new Date("2020-01-01") },
    });
    await expect(
      visits.act(coordinator, expired.id, key(), "ENTRY", {
        version: 1,
        identificacionVerificada: true,
      }),
    ).rejects.toMatchObject({ response: { error: "VISIT_STATE_INVALID" } });
  });
  it("contingency is idempotent, pending, private and requires an independent authority", async () => {
    const input = contingencyInput(),
      requestKey = key();
    const [a, b] = await Promise.all([
      review.contingency(coordinator, requestKey, input),
      review.contingency(coordinator, requestKey, input),
    ]);
    expect(a).toEqual(b);
    const row = a as any;
    expect(row).toMatchObject({ status: "PENDIENTE", isContingency: true });
    expect(row).not.toHaveProperty("contingencyJustification");
    await expect(
      review.contingency(coordinator, key(), input),
    ).rejects.toMatchObject({ response: { error: "ATTENDANCE_OVERLAP" } });
    await prisma.usuario.update({
      where: { id: coordinator.id },
      data: { rol: "JEFE_AREA" },
    });
    await expect(
      review.validate({ ...coordinator, rol: "JEFE_AREA" }, row.id, key(), {
        version: 1,
        decision: "AUTORIZADA",
        reason: "Synthetic self-approval",
      }),
    ).rejects.toMatchObject({
      response: { error: "ATTENDANCE_CORRECTOR_VALIDATION" },
    });
    await prisma.usuario.update({
      where: { id: coordinator.id },
      data: { rol: "COORDINADOR" },
    });
    await review.validate(authority, row.id, key(), {
      version: 1,
      decision: "AUTORIZADA",
      reason: "Synthetic independent approval",
    });
    const mine = await attendance.mine(owner, { limit: 20 });
    expect(mine.bank.authorizedSeconds).toBe(7200);
    expect(
      JSON.stringify(
        await review.queue(authority, { limit: 20, status: "AUTORIZADA" }),
      ),
    ).not.toContain(input.justification);
  });
  it("private signals require scoped audit permissions and reads themselves are audited", async () => {
    const row = await prisma.asistencia.findFirstOrThrow({
      where: { userId: owner.id },
    });
    await prisma.asistencia.update({
      where: { id: row.id },
      data: {
        clientIp: "192.0.2.20",
        geoLatitude: 19.4,
        geoLongitude: -99.1,
        checkoutSignal: { clientIp: "192.0.2.21" },
      },
    });
    await expect(review.signals(coordinator, row.id)).rejects.toMatchObject({
      response: { error: "FORBIDDEN" },
    });
    expect((await review.signals(authority, row.id)).clientIp).toBe(
      "192.0.2.20",
    );
    expect(
      JSON.stringify(
        await review.queue(authority, { status: "AUTORIZADA", limit: 20 }),
      ),
    ).not.toContain("192.0.2.20");
    expect(
      await prisma.auditEvent.count({
        where: { action: "ATTENDANCE_SIGNALS_READ", objectId: String(row.id) },
      }),
    ).toBe(1);
  });
  it("manual retry only advances schedule; exhausted attempts remain terminal", async () => {
    const operations = new OperationsService(
      prisma,
      audit,
      {} as any,
      settings as any,
      writes,
    );
    const job = await prisma.operationalJobExecution.create({
      data: {
        name: prefix,
        idempotencyKey: key(),
        state: "RETRY_SCHEDULED",
        attempts: 1,
        maxAttempts: 3,
        nextAttemptAt: new Date("2099-01-01"),
      },
    });
    const requestKey = key();
    const a = await operations.retryJob(admin, job.id, requestKey, {
      attempts: 1,
      reason: "Synthetic operator retry",
    });
    expect(
      await operations.retryJob(admin, job.id, requestKey, {
        attempts: 1,
        reason: "Synthetic operator retry",
      }),
    ).toEqual(a);
    expect(
      await prisma.operationalJobExecution.findUniqueOrThrow({
        where: { id: job.id },
      }),
    ).toMatchObject({ state: "RETRY_SCHEDULED", attempts: 1 });
    await prisma.operationalJobExecution.update({
      where: { id: job.id },
      data: { state: "FAILED", attempts: 3 },
    });
    await expect(
      operations.retryJob(admin, job.id, key(), {
        attempts: 3,
        reason: "Synthetic exhausted retry",
      }),
    ).rejects.toMatchObject({ response: { error: "JOB_NOT_RETRYABLE" } });
  });
  it("location/network warnings do not block real attendance writes or leak evidence", async () => {
    await review.publishPolicy(admin, key(), sedeId, {
      rules: {
        redBelowSeconds: 300,
        greenFromSeconds: 1800,
        greenUntilSeconds: 28800,
        redAboveSeconds: 36000,
      },
      locationRules: {
        mode: "UBICACION_Y_RED",
        latitude: 19.4,
        longitude: -99.1,
        radiusMeters: 100,
        maxAccuracyMeters: 200,
        networks: ["10.20.0.0/16"],
      },
      reason: "Synthetic informational policy",
    });
    const entered = (await attendance.checkIn(owner, key(), {
      clientIp: "192.0.2.30",
      coords: { latitude: 1000, longitude: 0, accuracy: 5 },
    })) as any;
    expect(entered.locationRiskCode).toBe("DATOS_DE_UBICACION_INCONSISTENTES");
    expect(entered.status).toBe("ABIERTA");
    expect(entered).not.toHaveProperty("clientIp");
    const closed = (await attendance.checkOut(owner, key(), entered.id, {
      clientIp: "192.0.2.31",
    })) as any;
    expect(closed.status).toBe("PENDIENTE");
    expect(closed.risk.reasons).toContain("UBICACION_NO_VERIFICADA");
    expect(closed).not.toHaveProperty("checkoutSignal");
    const queue = JSON.stringify(
      await review.queue(coordinator, { status: "PENDIENTE", limit: 20 }),
    );
    expect(queue).not.toContain("192.0.2.30");
    expect(queue).not.toContain("192.0.2.31");
    expect(queue).not.toContain("10.20.0.0/16");
  });
  it("console incident retry persists one incident and one transition", async () => {
    const operations = new OperationsService(
      prisma,
      audit,
      {} as any,
      settings as any,
      writes,
    );
    const requestKey = key(),
      input = {
        externalTicketRef: prefix,
        severity: "S4" as const,
        ownerId: admin.id,
        reason: "Synthetic operational incident",
        repeatedS2: false,
      };
    const a = (await operations.createIncident(
      admin,
      input,
      requestKey,
    )) as any;
    expect(await operations.createIncident(admin, input, requestKey)).toEqual(
      a,
    );
    const transitionKey = key(),
      update = {
        state: "MITIGANDO" as const,
        ownerId: admin.id,
        reason: "Synthetic mitigation note",
      };
    const b = await operations.updateIncident(
      admin,
      a.id,
      update,
      transitionKey,
    );
    expect(
      await operations.updateIncident(admin, a.id, update, transitionKey),
    ).toEqual(b);
    expect(
      await prisma.operationalIncidentEvent.count({
        where: { incidentId: a.id },
      }),
    ).toBe(2);
  });
});
