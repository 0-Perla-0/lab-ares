import { describe, expect, it, vi } from "vitest";
import { AbsenceEvaluationWorker } from "../../../src/absences/absence-evaluation.worker";
const now = new Date("2026-10-10T06:05:00Z");
const user = {
  id: 5,
  rol: "PRESTADOR",
  estado: "ACTIVA",
  sedeId: 1,
  areaId: 2,
  turnoId: 3,
  createdAt: new Date("2026-09-01"),
  updatedAt: new Date("2026-09-01"),
};
function deps() {
  const tx: any = {
    $queryRaw: vi.fn(),
    operationalHistory: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where.recordedAt.gt) return null;
        const snapshot =
          where.resourceType === "USER"
            ? { ...user }
            : where.resourceType === "SHIFT"
              ? { activo: true, areaId: 2, dias: ["VIERNES"] }
              : where.resourceType === "AREA"
                ? { activa: true, sedeId: 1 }
                : { activa: true };
        return { snapshot };
      }),
    },
    absenceEvaluationIssue: { upsert: vi.fn(), deleteMany: vi.fn() },
    recoveryWriteBarrier: {
      findUnique: vi.fn().mockResolvedValue({ active: false }),
    },
    calendarRevision: { findUnique: vi.fn().mockResolvedValue({ version: 0 }) },
    absenceEvaluationProgress: {
      findUnique: vi.fn().mockResolvedValue({
        id: "global",
        fecha: new Date("2026-10-09"),
        afterUserId: 0,
        completed: false,
      }),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        afterUserId: 0,
        completed: false,
        ...data,
      })),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({
        afterUserId: 0,
        completed: false,
        ...data,
      })),
    },
    usuario: {
      findMany: vi.fn().mockResolvedValue([user]),
      findUnique: vi.fn().mockResolvedValue(user),
    },
    asistencia: { findFirst: vi.fn().mockResolvedValue(null) },
    ausencia: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        id: "absence",
        ...data,
      })),
      update: vi.fn(),
    },
    notification: {
      create: vi.fn().mockResolvedValue({ id: "notification-test" }),
    },
    outboxEvent: { create: vi.fn() },
  };
  const db: any = { ...tx, $transaction: vi.fn(async (fn: any) => fn(tx)) };
  const calendar: any = {
    exceptionFor: vi.fn().mockResolvedValue(undefined),
    isWorkDay: vi.fn().mockResolvedValue({ isWorkDay: true }),
    isBusinessDay: vi.fn(
      async (_: unknown, day: string) =>
        ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()),
    ),
  };
  const audit: any = { append: vi.fn() };
  const config: any = { get: vi.fn() };
  return {
    tx,
    audit,
    calendar,
    worker: new AbsenceEvaluationWorker(db, calendar, audit, config),
  };
}
describe("durable absence evaluation", () => {
  it("creates only provisional absences with five business days and atomic audit", async () => {
    const d = deps();
    expect(await d.worker.processDue(100, now)).toBe(1);
    expect(d.tx.ausencia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 5,
        fecha: new Date("2026-10-09"),
        plazoLimiteAt: new Date("2026-10-17T05:59:59.999Z"),
      }),
    });
    expect(d.audit.append.mock.calls[0][0]).toMatchObject({
      action: "ABSENCE_PROVISIONAL_CREATED",
      metadata: { state: "PENDIENTE_JUSTIFICACION" },
    });
    expect(d.audit.append.mock.calls[0][1]).toBe(d.tx);
  });
  it("any check-in in the local civil day excludes absence, regardless of status", async () => {
    const d = deps();
    d.tx.asistencia.findFirst.mockResolvedValue({ id: 1, status: "RECHAZADA" });
    expect(await d.worker.processDue(100, now)).toBe(0);
    expect(d.tx.asistencia.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 5,
          checkInAt: {
            gte: new Date("2026-10-09T06:00:00Z"),
            lt: new Date("2026-10-10T06:00:00Z"),
          },
        },
      }),
    );
  });
  it("does not generate duplicate absences after a replay", async () => {
    const d = deps();
    d.tx.ausencia.findUnique.mockResolvedValue({ id: "existing" });
    expect(await d.worker.processDue(100, now)).toBe(0);
    expect(d.tx.ausencia.create).not.toHaveBeenCalled();
  });
  it("omits calendar suspensions and unassigned shift days", async () => {
    const d = deps();
    d.calendar.exceptionFor.mockResolvedValue({
      efecto: "SUSPENSION_ACTIVIDADES",
    });
    expect(await d.worker.processDue(100, now)).toBe(0);
  });
  it.each([{ estado: "SUSPENDIDA" }, { turnoId: null }, { rol: "ADMIN" }])(
    "does not invent historical duties %#",
    async (change) => {
      const d = deps();
      d.tx.operationalHistory.findFirst.mockImplementation(
        async ({ where }: any) =>
          where.recordedAt.gt ? null : { snapshot: { ...user, ...change } },
      );
      expect(await d.worker.processDue(100, now)).toBe(0);
      expect(d.tx.ausencia.create).not.toHaveBeenCalled();
    },
  );
  it("a current assignment/password change does not erase a known historical obligation", async () => {
    const d = deps();
    d.tx.usuario.findUnique.mockResolvedValue({
      ...user,
      estado: "SUSPENDIDA",
      updatedAt: now,
    });
    expect(await d.worker.processDue(100, now)).toBe(1);
  });
  it("records unknown history durably instead of inventing an obligation", async () => {
    const d = deps();
    d.tx.operationalHistory.findFirst.mockResolvedValue(null);
    expect(await d.worker.processDue(100, now)).toBe(0);
    expect(d.tx.absenceEvaluationIssue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 5,
          reason: "ASSIGNMENT_HISTORY_UNKNOWN",
        }),
      }),
    );
  });
  it("does not evaluate a day before local midnight", async () => {
    const d = deps();
    expect(
      await d.worker.processDue(100, new Date("2026-10-10T05:59:30Z")),
    ).toBe(0);
    expect(d.tx.usuario.findMany).not.toHaveBeenCalled();
  });
  it("stores the user cursor and only completes a fully scanned day", async () => {
    const d = deps();
    await d.worker.processDue(1, now);
    expect(d.tx.absenceEvaluationProgress.update).toHaveBeenCalledWith({
      where: { id: "global" },
      data: { afterUserId: 5, completed: false },
    });
  });
  it("expiry includes initial and clarification deadlines and opens an appeal window", async () => {
    const d = deps();
    d.tx.ausencia.findMany.mockResolvedValue([
      { ...user, id: "absence", userId: 5, estado: "EN_ACLARACION" },
    ]);
    d.tx.usuario.findMany.mockResolvedValue([]);
    expect(await d.worker.processDue(100, now)).toBe(1);
    expect(d.tx.ausencia.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: "NO_JUSTIFICADA",
          motivoResolucion: "PLAZO_VENCIDO",
          apelacionLimiteAt: new Date("2026-10-15T05:59:59.999Z"),
        }),
      }),
    );
  });
  it("does not mutate or advance the checkpoint while recovery is frozen", async () => {
    const d = deps();
    d.tx.recoveryWriteBarrier.findUnique.mockResolvedValue({ active: true });
    expect(await d.worker.processDue(100, now)).toBe(0);
    expect(d.tx.absenceEvaluationProgress.update).not.toHaveBeenCalled();
  });
  it("audit failure leaves checkpoint advancement unreachable", async () => {
    const d = deps();
    d.audit.append.mockRejectedValue(new Error("audit unavailable"));
    await expect(d.worker.processDue(100, now)).rejects.toThrow(
      "audit unavailable",
    );
    expect(d.tx.absenceEvaluationProgress.update).not.toHaveBeenCalled();
  });
});
