import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AbsencesService,
  absenceScope,
} from "../../../src/absences/absences.service";
import { AbsencesRepository } from "../../../src/absences/absences.repository";
import { AbsenceTransaction } from "../../../src/absences/absence-transaction";
import {
  justificationSchema,
  appealSchema,
} from "../../../src/absences/absences.schemas";
import { Permission } from "../../../src/auth/permissions";

const actor: any = {
  id: 5,
  rol: "PRESTADOR",
  estado: "ACTIVA",
  areaId: 2,
  sedeId: 1,
  turnoId: 3,
};
const reviewer: any = { ...actor, id: 9, rol: "COORDINADOR" };
const authority: any = { ...actor, id: 10, rol: "JEFE_AREA" };
function base(): any {
  return {
    id: "c123456789012345678901234",
    userId: 5,
    sedeId: 1,
    areaId: 2,
    turnoId: 3,
    fecha: new Date("2026-10-08T00:00:00Z"),
    estado: "PENDIENTE_JUSTIFICACION",
    version: 1,
    plazoLimiteAt: new Date("2026-10-20T05:59:59Z"),
    aclaracionLimiteAt: null,
    apelacionLimiteAt: null,
    resueltoPorId: null,
    justificaciones: [],
    apelacion: null,
  };
}
function deps(row = base(), current = actor) {
  const operations = new Map<string, any>();
  const tx: any = {
    $queryRaw: vi.fn(),
    recoveryWriteBarrier: {
      findUnique: vi.fn().mockResolvedValue({ active: false }),
    },
    calendarRevision: { findUnique: vi.fn().mockResolvedValue({ version: 0 }) },
    usuario: {
      findUnique: vi
        .fn()
        .mockImplementation(async ({ select }: any) =>
          select ? reviewer : current,
        ),
    },
    ausencia: {
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({
        ...row,
        ...data,
        version: row.version + 1,
      })),
    },
    justificacionAusencia: { create: vi.fn() },
    apelacionAusencia: { create: vi.fn(), update: vi.fn() },
    archivo: {
      findUnique: vi.fn().mockResolvedValue({
        propietarioId: 5,
        status: "DISPONIBLE",
        detectedMime: "application/pdf",
        sizeBytes: 1000n,
      }),
    },
    absenceOperation: {
      findUnique: vi
        .fn()
        .mockImplementation(
          async ({ where }: any) =>
            operations.get(where.actorId_key.key) ?? null,
        ),
      create: vi
        .fn()
        .mockImplementation(async ({ data }: any) =>
          operations.set(data.key, data),
        ),
    },
    notification: {
      create: vi.fn().mockResolvedValue({ id: "notification-test" }),
    },
    outboxEvent: { create: vi.fn() },
  };
  const db: any = { ...tx, $transaction: vi.fn(async (fn: any) => fn(tx)) };
  const audit: any = { append: vi.fn() };
  const calendar: any = {
    isBusinessDay: vi.fn(
      async (_: unknown, day: string) =>
        ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()),
    ),
  };
  const service = new AbsencesService(
    db,
    new AbsencesRepository(db),
    new AbsenceTransaction(db),
    calendar,
    audit,
    {} as any,
  );
  return { tx, db, audit, service, calendar };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T18:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("absence lifecycle", () => {
  it("persists a private justification and audited notification in the same transaction", async () => {
    const d = deps();
    const result: any = await d.service.justify(
      actor,
      "request-key",
      base().id,
      {
        version: 1,
        motivo: "Motivo privado de salud",
        archivoId: "a".repeat(30),
      },
    );
    expect(result.estado).toBe("JUSTIFICACION_ENVIADA");
    expect(d.tx.justificacionAusencia.create).toHaveBeenCalledOnce();
    expect(d.audit.append.mock.calls[0][1]).toBe(d.tx);
    expect(JSON.stringify(d.audit.append.mock.calls)).not.toContain(
      "Motivo privado de salud",
    );
    expect(d.tx.notification.create).toHaveBeenCalledOnce();
  });
  it("replays the exact response without inserting a second justification", async () => {
    const d = deps(),
      input = { version: 1, motivo: "Motivo válido" };
    const first = await d.service.justify(
      actor,
      "request-key",
      base().id,
      input,
    );
    expect(
      await d.service.justify(actor, "request-key", base().id, input),
    ).toEqual(first);
    expect(d.tx.justificacionAusencia.create).toHaveBeenCalledOnce();
  });
  it("rejects changed payload under the same key", async () => {
    const d = deps();
    await d.service.justify(actor, "request-key", base().id, {
      version: 1,
      motivo: "Motivo válido",
    });
    await expect(
      d.service.justify(actor, "request-key", base().id, {
        version: 1,
        motivo: "Motivo diferente",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });
  it("propagates audit failure and does not persist a replay response", async () => {
    const d = deps();
    d.audit.append.mockRejectedValue(new Error("audit failed"));
    await expect(
      d.service.justify(actor, "request-key", base().id, {
        version: 1,
        motivo: "Motivo válido",
      }),
    ).rejects.toThrow("audit failed");
    expect(d.tx.absenceOperation.create).not.toHaveBeenCalled();
  });
  it.each([
    "JUSTIFICADA",
    "NO_JUSTIFICADA",
    "EN_APELACION",
    "CANCELADA",
    "JUSTIFICACION_ENVIADA",
  ])("cannot justify from %s", async (estado) => {
    const d = deps({ ...base(), estado });
    await expect(
      d.service.justify(actor, "request-key", base().id, {
        version: 1,
        motivo: "Motivo válido",
      }),
    ).rejects.toMatchObject({ code: "ABSENCE_STATE_INVALID" });
  });
  it("requires ownership, even for an administrator", async () => {
    const admin = { ...authority, rol: "ADMIN" };
    const d = deps(base(), admin);
    await expect(
      d.service.justify(admin, "request-key", base().id, {
        version: 1,
        motivo: "Motivo válido",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("requires an unexpired justification deadline", async () => {
    const d = deps({
      ...base(),
      plazoLimiteAt: new Date("2026-10-09T05:59:59Z"),
    });
    await expect(
      d.service.justify(actor, "request-key", base().id, {
        version: 1,
        motivo: "Motivo válido",
      }),
    ).rejects.toMatchObject({ code: "ABSENCE_DEADLINE_EXPIRED" });
  });
  it("uses the clarification deadline rather than the initial deadline", async () => {
    const d = deps({
      ...base(),
      estado: "EN_ACLARACION",
      plazoLimiteAt: new Date("2026-10-01"),
      aclaracionLimiteAt: new Date("2026-10-13T05:59:59Z"),
    });
    await expect(
      d.service.justify(actor, "request-key", base().id, {
        version: 1,
        motivo: "Aclaración válida",
      }),
    ).resolves.toMatchObject({ estado: "JUSTIFICACION_ENVIADA" });
  });
  it.each([
    { propietarioId: 99 },
    { status: "PENDIENTE_ANALISIS" },
    { status: "RECHAZADO" },
    { detectedMime: "text/plain" },
    { sizeBytes: 11n * 1024n * 1024n },
  ])("rejects unsafe evidence %#", async (change) => {
    const d = deps();
    d.tx.archivo.findUnique.mockResolvedValue({
      propietarioId: 5,
      status: "DISPONIBLE",
      detectedMime: "application/pdf",
      sizeBytes: 1000n,
      ...change,
    });
    await expect(
      d.service.justify(actor, "request-key", base().id, {
        version: 1,
        motivo: "Motivo válido",
        archivoId: "a".repeat(30),
      }),
    ).rejects.toMatchObject({ code: "ABSENCE_EVIDENCE_UNAVAILABLE" });
  });
  it("rejects stale versions", async () => {
    const d = deps();
    await expect(
      d.service.justify(actor, "request-key", base().id, {
        version: 2,
        motivo: "Motivo válido",
      }),
    ).rejects.toMatchObject({ code: "ABSENCE_VERSION_CHANGED" });
  });
  it("requests exactly two business days of clarification", async () => {
    const d = deps({ ...base(), estado: "JUSTIFICACION_ENVIADA" }, reviewer);
    const response: any = await d.service.resolve(
      reviewer,
      "request-key",
      base().id,
      { version: 1, decision: "EN_ACLARACION", motivo: "Falta información" },
    );
    expect(response.aclaracionLimiteAt).toBe("2026-10-14T05:59:59.999Z");
  });
  it("rejection opens exactly three business days for appeal", async () => {
    const d = deps({ ...base(), estado: "JUSTIFICACION_ENVIADA" }, reviewer);
    const response: any = await d.service.resolve(
      reviewer,
      "request-key",
      base().id,
      {
        version: 1,
        decision: "NO_JUSTIFICADA",
        motivo: "No acredita el motivo",
      },
    );
    expect(response.apelacionLimiteAt).toBe("2026-10-15T05:59:59.999Z");
  });
  it("denies cross-area review", async () => {
    const d = deps(
      { ...base(), estado: "JUSTIFICACION_ENVIADA", areaId: 8 },
      reviewer,
    );
    await expect(
      d.service.resolve(reviewer, "request-key", base().id, {
        version: 1,
        decision: "JUSTIFICADA",
        motivo: "Acreditado",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("denies self review", async () => {
    const d = deps(
      { ...base(), userId: reviewer.id, estado: "JUSTIFICACION_ENVIADA" },
      reviewer,
    );
    await expect(
      d.service.resolve(reviewer, "request-key", base().id, {
        version: 1,
        decision: "JUSTIFICADA",
        motivo: "Acreditado",
      }),
    ).rejects.toMatchObject({ code: "ABSENCE_SELF_RESOLUTION" });
  });
  it("accepts one ordinary appeal", async () => {
    const d = deps({
      ...base(),
      estado: "NO_JUSTIFICADA",
      apelacionLimiteAt: new Date("2026-10-15T05:59:59Z"),
    });
    await expect(
      d.service.appeal(actor, "request-key", base().id, {
        version: 1,
        argumento: "Argumento de apelación",
      }),
    ).resolves.toMatchObject({ estado: "EN_APELACION" });
  });
  it("cannot appeal twice", async () => {
    const d = deps({
      ...base(),
      estado: "NO_JUSTIFICADA",
      apelacion: { id: "appeal" },
      apelacionLimiteAt: new Date("2026-10-15T05:59:59Z"),
    });
    await expect(
      d.service.appeal(actor, "request-key", base().id, {
        version: 1,
        argumento: "Argumento de apelación",
      }),
    ).rejects.toMatchObject({ code: "ABSENCE_STATE_INVALID" });
  });
  it("requires a distinct appeal authority", async () => {
    const d = deps(
      {
        ...base(),
        estado: "EN_APELACION",
        resueltoPorId: authority.id,
        apelacion: { id: "appeal" },
      },
      authority,
    );
    await expect(
      d.service.resolveAppeal(authority, "request-key", base().id, {
        version: 1,
        decision: "JUSTIFICADA",
        motivo: "Acreditado",
      }),
    ).rejects.toMatchObject({ code: "ABSENCE_INDEPENDENT_REVIEW_REQUIRED" });
  });
  it("rejects a junior appeal authority", async () => {
    const d = deps(
      {
        ...base(),
        estado: "EN_APELACION",
        resueltoPorId: 90,
        apelacion: { id: "appeal" },
      },
      authority,
    );
    d.tx.usuario.findUnique.mockImplementation(async ({ select }: any) =>
      select ? { rol: "JEFE_SEDE" } : authority,
    );
    await expect(
      d.service.resolveAppeal(authority, "request-key", base().id, {
        version: 1,
        decision: "JUSTIFICADA",
        motivo: "Acreditado",
      }),
    ).rejects.toMatchObject({ code: "ABSENCE_INDEPENDENT_REVIEW_REQUIRED" });
  });
  it("resolves an appeal once, preserving the original rejection rationale", async () => {
    const d = deps(
      {
        ...base(),
        estado: "EN_APELACION",
        resueltoPorId: reviewer.id,
        motivoResolucion: "Rechazo original",
        apelacion: { id: "appeal" },
      },
      authority,
    );
    await expect(
      d.service.resolveAppeal(authority, "request-key", base().id, {
        version: 1,
        decision: "JUSTIFICADA",
        motivo: "Nueva evidencia aceptada",
      }),
    ).resolves.toMatchObject({
      estado: "JUSTIFICADA",
      motivoResolucion: "Rechazo original",
    });
    expect(d.tx.apelacionAusencia.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resueltoPorId: authority.id,
          resolucion: "Nueva evidencia aceptada",
        }),
      }),
    );
  });
  it("blocks mutations behind the durable barrier", async () => {
    const d = deps();
    d.tx.recoveryWriteBarrier.findUnique.mockResolvedValue({ active: true });
    await expect(
      d.service.justify(actor, "request-key", base().id, {
        version: 1,
        motivo: "Motivo válido",
      }),
    ).rejects.toMatchObject({ code: "RECOVERY_WRITE_BARRIER_ACTIVE" });
    expect(d.tx.justificacionAusencia.create).not.toHaveBeenCalled();
  });
  it("fails closed when the calendar mutex is missing", async () => {
    const d = deps();
    d.tx.calendarRevision.findUnique.mockResolvedValue(null);
    await expect(
      d.service.justify(actor, "request-key", base().id, {
        version: 1,
        motivo: "Motivo válido",
      }),
    ).rejects.toMatchObject({ code: "CALENDAR_NOT_READY" });
  });
  it("revalidates actor state before replay", async () => {
    const d = deps(base(), { ...actor, estado: "SUSPENDIDA" });
    await expect(
      d.service.justify(actor, "request-key", base().id, {
        version: 1,
        motivo: "Motivo válido",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("fails closed for missing organizational assignments", () => {
    expect(() =>
      absenceScope({ ...reviewer, areaId: null }, Permission.ABSENCES_REVIEW),
    ).toThrow();
  });
  it("strict schemas reject unrecognized fields and malformed evidence", () => {
    expect(
      justificationSchema.safeParse({
        version: 1,
        motivo: "Válido",
        ownerId: 9,
      }).success,
    ).toBe(false);
    expect(
      appealSchema.safeParse({
        version: 1,
        argumento: "Válido",
        archivoId: "foreign-id",
      }).success,
    ).toBe(false);
  });
});
