import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceReviewService } from "../../../src/attendance/attendance-review.service";
import { AttendancePolicy } from "../../../src/attendance/attendance.policy";
import {
  dailyCutoff,
  DEFAULT_RISK_RULES,
  evaluateRisk,
  riskRulesSchema,
} from "../../../src/attendance/attendance-risk";
import {
  batchValidationSchema,
  correctionSchema,
} from "../../../src/attendance/attendance-review.schemas";
import { closeOverdue } from "../../../src/attendance/attendance-cutoff";
import { Prisma } from "../../../src/generated/prisma/client";

const start = new Date("2026-10-05T15:00:00Z");
const shift = { start: "08:00:00", end: "18:00:00", days: ["LUNES"] };
const actor: any = {
  id: 9,
  rol: "JEFE_AREA",
  estado: "ACTIVA",
  sedeId: 1,
  areaId: 2,
};
const base = () => ({
  id: 1,
  userId: 5,
  sedeId: 1,
  areaId: 2,
  turnoId: 3,
  version: 2,
  status: "PENDIENTE",
  requiresReview: false,
  checkInAt: start,
  checkOutAt: new Date("2026-10-05T17:00:00Z"),
  durationSeconds: 7200,
  user: { codigo: "USER5" },
  shiftSnapshot: shift,
  policySnapshot: { version: 1, rules: DEFAULT_RISK_RULES },
  riskSnapshot: null,
});
function deps(row = base()) {
  const tx: any = {
    $queryRaw: vi.fn(),
    usuario: { findUnique: vi.fn().mockResolvedValue(actor) },
    recoveryWriteBarrier: {
      findUnique: vi.fn().mockResolvedValue({ active: false }),
    },
    asistencia: {
      findUnique: vi
        .fn()
        .mockImplementation(async (input: any) =>
          input.select ? { userId: row.userId } : row,
        ),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({
        ...row,
        ...data,
        version: row.version + 1,
      })),
    },
    asistenciaEvento: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    asistenciaValidacion: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    asistenciaSolicitud: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    notification: {
      create: vi.fn().mockResolvedValue({ id: "notification-test" }),
    },
    outboxEvent: { create: vi.fn() },
  };
  const db: any = { ...tx, $transaction: vi.fn(async (fn: any) => fn(tx)) };
  const audit: any = { append: vi.fn() };
  return {
    tx,
    db,
    audit,
    service: new AttendanceReviewService(db, new AttendancePolicy(), audit),
  };
}
beforeEach(() => vi.restoreAllMocks());
it("retries a deadlock without changing payload identity or auditing twice", async () => {
  const { db, service, tx, audit } = deps();
  db.$transaction.mockRejectedValueOnce(
    new Prisma.PrismaClientKnownRequestError("synthetic deadlock", {
      code: "P2034",
      clientVersion: "test",
    }),
  );
  await service.validate(actor, 1, "synthetic-retry-key", {
    version: 2,
    decision: "AUTORIZADA",
    reason: "Independent synthetic approval",
  });
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(tx.asistenciaSolicitud.create).toHaveBeenCalledTimes(1);
  expect(audit.append).toHaveBeenCalledTimes(1);
});
describe("attendance risk policy", () => {
  it.each([
    [299, "ROJO"],
    [300, "AMARILLO"],
    [1799, "AMARILLO"],
    [1800, "VERDE"],
    [28800, "VERDE"],
    [28801, "AMARILLO"],
    [36000, "AMARILLO"],
    [36001, "ROJO"],
  ])("classifies %i seconds as %s", (seconds, color) => {
    const risk = evaluateRisk({
      start,
      end: new Date(+start + Number(seconds) * 1000),
      shift: { ...shift, end: "23:59:00" },
    });
    expect(risk.color).toBe(color);
  });
  it("preserves yellow after correction", () => {
    expect(
      evaluateRisk({
        start,
        end: new Date(+start + 3600000),
        shift,
        corrected: true,
      }).reasons,
    ).toContain("SESION_CORREGIDA");
  });
  it("never treats missing shift evidence as green", () => {
    expect(evaluateRisk({ start, end: new Date(+start + 3600000) }).color).toBe(
      "AMARILLO",
    );
  });
  it("marks omitted checkout red and separates it from decisions", () => {
    expect(
      evaluateRisk({
        start,
        end: new Date(+start + 3600000),
        shift,
        omitted: true,
      }),
    ).toMatchObject({ color: "ROJO", reasons: ["CHECKOUT_OMITIDO"] });
  });
  it("marks overlaps and inconsistent intervals red", () => {
    expect(
      evaluateRisk({
        start,
        end: new Date(+start - 1000),
        shift,
        overlap: true,
      }).reasons,
    ).toEqual(["INTERVALO_INCONSISTENTE", "SOLAPAMIENTO"]);
  });
  it("evaluates weekday and shift boundaries", () => {
    expect(
      evaluateRisk({
        start,
        end: new Date(+start + 3600000),
        shift: { ...shift, days: ["MARTES"] },
      }).reasons,
    ).toContain("FUERA_DE_TURNO");
  });
  it("calculates 23:59 in Mexico independently of host timezone", () => {
    expect(dailyCutoff(start).toISOString()).toBe("2026-10-06T05:59:00.000Z");
  });
  it("supports pre-2022 timezone offsets through Intl", () => {
    expect(dailyCutoff(new Date("2021-07-05T15:00:00Z")).toISOString()).toBe(
      "2021-07-06T04:59:00.000Z",
    );
  });
  it("rejects unordered thresholds", () => {
    expect(
      riskRulesSchema.safeParse({
        ...DEFAULT_RISK_RULES,
        greenUntilSeconds: 40000,
      }).success,
    ).toBe(false);
  });
  it("limits batch to 100 distinct ids and requires a reason", () => {
    expect(
      batchValidationSchema.safeParse({
        items: Array.from({ length: 101 }, (_, index) => ({
          id: index + 1,
          version: 1,
        })),
        reason: "Validado",
      }).success,
    ).toBe(false);
    expect(
      batchValidationSchema.safeParse({
        items: [
          { id: 1, version: 1 },
          { id: 1, version: 2 },
        ],
        reason: "Validado",
      }).success,
    ).toBe(false);
  });
  it("rejects client-owned risk and duration in corrections", () => {
    expect(
      correctionSchema.safeParse({
        version: 1,
        checkInAt: start.toISOString(),
        checkOutAt: new Date(+start + 3600000).toISOString(),
        reason: "Ajuste",
        durationSeconds: 1,
      }).success,
    ).toBe(false);
  });
});
describe("attendance validation boundaries", () => {
  it("fails closed when recovery is frozen", async () => {
    const x = deps();
    x.tx.recoveryWriteBarrier.findUnique.mockResolvedValue({ active: true });
    await expect(
      x.service.validate(actor, 1, "validation-key-01", {
        version: 2,
        decision: "AUTORIZADA",
        reason: "Revisión completa",
      }),
    ).rejects.toMatchObject({ code: "RECOVERY_WRITE_BARRIER_ACTIVE" });
    expect(x.tx.asistenciaValidacion.create).not.toHaveBeenCalled();
  });
  it("writes decision, notification, audit and replay record in one transaction", async () => {
    const x = deps();
    await x.service.validate(actor, 1, "validation-key-01", {
      version: 2,
      decision: "AUTORIZADA",
      reason: "Revisión completa",
    });
    expect(x.tx.asistenciaValidacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousVersion: 2,
        decision: "AUTORIZADA",
      }),
    });
    expect(x.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ATTENDANCE_VALIDATED", actorId: 9 }),
      x.tx,
    );
    expect(x.tx.notification.create).toHaveBeenCalled();
    expect(x.tx.asistenciaSolicitud.create).toHaveBeenCalled();
  });
  it("rejects self-validation", async () => {
    const x = deps({ ...base(), userId: actor.id });
    await expect(
      x.service.validate(actor, 1, "validation-key-01", {
        version: 2,
        decision: "AUTORIZADA",
        reason: "Revisión completa",
      }),
    ).rejects.toMatchObject({ code: "ATTENDANCE_SELF_VALIDATION" });
    expect(x.tx.asistenciaValidacion.create).not.toHaveBeenCalled();
  });
  it("denies coordinators final authorization", async () => {
    const coordinator = { ...actor, rol: "COORDINADOR" };
    const x = deps();
    x.tx.usuario.findUnique.mockResolvedValue(coordinator);
    await expect(
      x.service.validate(coordinator, 1, "validation-key-01", {
        version: 2,
        decision: "AUTORIZADA",
        reason: "Revisión completa",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("denies validation by a corrector or manual closer", async () => {
    const x = deps();
    x.tx.asistenciaEvento.findFirst.mockResolvedValue({ action: "CORRECT" });
    await expect(
      x.service.validate(actor, 1, "validation-key-01", {
        version: 2,
        decision: "RECHAZADA",
        reason: "Revisión completa",
      }),
    ).rejects.toMatchObject({ code: "ATTENDANCE_CORRECTOR_VALIDATION" });
  });
  it("denies records outside the manager's area", async () => {
    const x = deps({ ...base(), areaId: 88 });
    await expect(
      x.service.validate(actor, 1, "validation-key-01", {
        version: 2,
        decision: "AUTORIZADA",
        reason: "Revisión completa",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("requires a current version and pending state", async () => {
    const x = deps();
    await expect(
      x.service.validate(actor, 1, "validation-key-01", {
        version: 1,
        decision: "AUTORIZADA",
        reason: "Revisión completa",
      }),
    ).rejects.toMatchObject({ code: "ATTENDANCE_VERSION_CHANGED" });
    const y = deps({ ...base(), status: "AUTORIZADA" });
    await expect(
      y.service.validate(actor, 1, "validation-key-01", {
        version: 2,
        decision: "RECHAZADA",
        reason: "Revisión completa",
      }),
    ).rejects.toMatchObject({ code: "ATTENDANCE_REVIEW_STATE_INVALID" });
  });
  it("requires correction before authorizing omitted checkout but permits rejection", async () => {
    const x = deps({ ...base(), requiresReview: true });
    await expect(
      x.service.validate(actor, 1, "validation-key-01", {
        version: 2,
        decision: "AUTORIZADA",
        reason: "Revisión completa",
      }),
    ).rejects.toMatchObject({ code: "ATTENDANCE_CORRECTION_REQUIRED" });
    await x.service.validate(actor, 1, "validation-key-02", {
      version: 2,
      decision: "RECHAZADA",
      reason: "No corresponde",
    });
  });
  it("rechecks current risk for bulk approval", async () => {
    const x = deps({
      ...base(),
      riskSnapshot: { color: "VERDE" } as any,
      requiresReview: true,
    });
    await expect(
      x.service.batch(actor, "validation-key-01", {
        items: [{ id: 1, version: 2 }],
        reason: "Revisión completa",
      }),
    ).rejects.toMatchObject({ code: "ATTENDANCE_BATCH_REQUIRES_GREEN" });
    expect(x.tx.asistenciaValidacion.create).not.toHaveBeenCalled();
  });
  it("approves a green batch", async () => {
    const x = deps();
    await x.service.batch(actor, "validation-key-01", {
      items: [{ id: 1, version: 2 }],
      reason: "Revisión completa",
    });
    expect(x.tx.asistenciaValidacion.create).toHaveBeenCalledTimes(1);
  });
  it("does not save success when auditing fails", async () => {
    const x = deps();
    x.audit.append.mockRejectedValue(new Error("audit failed"));
    await expect(
      x.service.validate(actor, 1, "validation-key-01", {
        version: 2,
        decision: "AUTORIZADA",
        reason: "Revisión completa",
      }),
    ).rejects.toThrow("audit failed");
    expect(x.tx.asistenciaSolicitud.create).not.toHaveBeenCalled();
  });
  it("returns the saved response without repeating validation", async () => {
    const x = deps();
    const input = {
      version: 2,
      decision: "AUTORIZADA" as const,
      reason: "Revisión completa",
    };
    await x.service.validate(actor, 1, "validation-key-01", input);
    const saved = x.tx.asistenciaSolicitud.create.mock.calls[0][0].data;
    x.tx.asistenciaSolicitud.findUnique.mockResolvedValue(saved);
    x.tx.asistenciaValidacion.create.mockClear();
    expect(
      await x.service.validate(actor, 1, "validation-key-01", input),
    ).toEqual(saved.response);
    expect(x.tx.asistenciaValidacion.create).not.toHaveBeenCalled();
    await expect(
      x.service.validate(actor, 1, "validation-key-01", {
        ...input,
        reason: "Otro motivo",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });
  it("captures before and after without mutating previous events", async () => {
    const x = deps();
    await x.service.correct(actor, 1, "correction-key-01", {
      version: 2,
      checkInAt: start.toISOString(),
      checkOutAt: new Date(+start + 3600000).toISOString(),
      reason: "Salida corregida",
    });
    expect(x.tx.asistenciaEvento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CORRECT",
        metadata: expect.objectContaining({
          before: expect.any(Object),
          after: expect.any(Object),
        }),
      }),
    });
    expect(
      x.tx.asistencia.update.mock.calls.at(-1)[0].data.riskSnapshot.color,
    ).toBe("AMARILLO");
  });
  it("rejects corrections overlapping another interval", async () => {
    const x = deps();
    x.tx.asistencia.findFirst.mockResolvedValue({ id: 99 });
    await expect(
      x.service.correct(actor, 1, "correction-key-01", {
        version: 2,
        checkInAt: start.toISOString(),
        checkOutAt: new Date(+start + 3600000).toISOString(),
        reason: "Salida corregida",
      }),
    ).rejects.toMatchObject({ code: "ATTENDANCE_OVERLAP" });
  });
  it("keeps history private outside ownership or scope", async () => {
    const x = deps({ ...base(), areaId: 88 });
    await expect(x.service.history(actor, 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
describe("daily cutoff", () => {
  it("closes at 23:59 and records system audit and notification", async () => {
    const row = { ...base(), status: "ABIERTA", checkOutAt: null };
    const x = deps(row as any);
    expect(
      await closeOverdue(x.tx, 5, new Date("2026-10-06T06:00:00Z"), x.audit),
    ).toBe(true);
    expect(x.tx.asistencia.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        checkOutAt: dailyCutoff(start),
        openUserId: null,
        requiresReview: true,
        closeReason: "CHECKOUT_OMITIDO",
        closedById: null,
      }),
    });
    expect(x.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "SYSTEM" }),
      x.tx,
    );
  });
  it("does nothing before cutoff or after an already closed interval", async () => {
    const x = deps();
    expect(
      await closeOverdue(x.tx, 5, new Date("2026-10-05T22:00:00Z"), x.audit),
    ).toBe(false);
    x.tx.asistencia.findUnique.mockResolvedValue(null);
    expect(
      await closeOverdue(x.tx, 5, new Date("2026-10-06T08:00:00Z"), x.audit),
    ).toBe(false);
    expect(x.tx.asistencia.update).not.toHaveBeenCalled();
  });
});
