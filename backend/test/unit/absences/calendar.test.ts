import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CalendarService,
  chooseException,
  exceptionIsWorkDay,
} from "../../../src/calendar/calendar.service";
import {
  businessDeadline,
  mexicoInstant,
} from "../../../src/calendar/calendar-time";
import { exceptionSchema } from "../../../src/calendar/calendar.schemas";
import { AbsenceTransaction } from "../../../src/absences/absence-transaction";
import { absenceCalendarPaths } from "../../../src/openapi/absence-calendar.openapi";
const actor: any = {
  id: 9,
  rol: "ADMIN",
  estado: "ACTIVA",
  sedeId: 1,
  areaId: 2,
};
const input: any = {
  titulo: "Suspensión",
  motivo: "Cierre institucional",
  tipo: "SUSPENSION_OPERATIVA",
  efecto: "SUSPENSION_ACTIVIDADES",
  alcance: "GLOBAL",
  fechaInicio: "2026-10-08",
  fechaFin: "2026-10-08",
};
function deps() {
  let preview: any = null;
  let revision = 0;
  let rows: any[] = [];
  const tx: any = {
    $queryRaw: vi.fn(),
    recoveryWriteBarrier: {
      findUnique: vi.fn().mockResolvedValue({ active: false }),
    },
    calendarRevision: {
      findUnique: vi
        .fn()
        .mockImplementation(async () => ({ version: revision })),
      findUniqueOrThrow: vi
        .fn()
        .mockImplementation(async () => ({ version: revision })),
      update: vi.fn(async () => revision++),
    },
    usuario: {
      findUnique: vi.fn().mockResolvedValue(actor),
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 5, updatedAt: new Date("2026-09-01") }]),
    },
    area: { findUnique: vi.fn().mockResolvedValue({ id: 2, sedeId: 1 }) },
    sede: { findUnique: vi.fn().mockResolvedValue({ id: 1 }) },
    ausencia: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    asistencia: { findMany: vi.fn().mockResolvedValue([]) },
    absenceOperation: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    calendarPreview: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        preview = { id: "c123456789012345678901234", ...data };
        return preview;
      }),
      findUnique: vi.fn(async () => preview),
    },
    excepcionCalendario: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: "exception", createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      }),
      findMany: vi.fn(async () => rows),
      findUnique: vi.fn(async () => rows[0]),
      update: vi
        .fn()
        .mockImplementation(async ({ data }: any) => ({ ...rows[0], ...data })),
    },
    notification: { create: vi.fn().mockResolvedValue({ id: "notice" }) },
    outboxEvent: { create: vi.fn() },
  };
  const db: any = { ...tx, $transaction: vi.fn(async (fn: any) => fn(tx)) };
  const audit: any = { append: vi.fn() };
  return {
    tx,
    audit,
    service: new CalendarService(db, new AbsenceTransaction(db), audit),
    setPreview: (value: any) => {
      preview = value;
    },
    setRows: (value: any[]) => {
      rows = value;
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T18:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("civil dates and business deadlines", () => {
  it("resolves historical Mexico offsets without the host timezone", () => {
    expect(mexicoInstant("2021-07-05").toISOString()).toBe(
      "2021-07-05T05:00:00.000Z",
    );
    expect(mexicoInstant("2026-10-05").toISOString()).toBe(
      "2026-10-05T06:00:00.000Z",
    );
  });
  it("counts five weekdays, skipping weekends and a holiday", async () => {
    const deadline = await businessDeadline(
      new Date("2026-10-09T18:00:00Z"),
      5,
      async (day) =>
        day !== "2026-10-12" &&
        ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()),
    );
    expect(deadline.toISOString()).toBe("2026-10-20T05:59:59.999Z");
  });
  it("uses the local originating day even just after UTC midnight", async () => {
    const deadline = await businessDeadline(
      new Date("2026-10-10T01:00:00Z"),
      2,
      async (day) => ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()),
    );
    expect(deadline.toISOString()).toBe("2026-10-14T05:59:59.999Z");
  });
});
describe("calendar precedence and validation", () => {
  it("resolves user > area > sede > global independently of creation order", () => {
    const rows: any = ["GLOBAL", "SEDE", "AREA", "USUARIO"].map(
      (alcance, i) => ({
        alcance,
        id: String(i),
        createdAt: new Date(2026, 0, 4 - i),
      }),
    );
    expect(chooseException(rows).alcance).toBe("USUARIO");
    expect(chooseException(rows.slice(0, 3)).alcance).toBe("AREA");
  });
  it("breaks same-scope ties by newest creation and stable id", () => {
    expect(
      chooseException([
        { alcance: "GLOBAL", createdAt: new Date(1), id: "a" },
        { alcance: "GLOBAL", createdAt: new Date(2), id: "b" },
      ] as any).id,
    ).toBe("b");
  });
  it.each(["SUSPENSION_ACTIVIDADES", "PERMISO_PROGRAMADO"])(
    "exempts %s",
    (efecto) => expect(exceptionIsWorkDay({ efecto } as any)).toBe(false),
  );
  it.each(["HORARIO_ESPECIAL", "ASISTENCIA_EXTRAORDINARIA"])(
    "requires attendance for %s",
    (efecto) => expect(exceptionIsWorkDay({ efecto } as any)).toBe(true),
  );
  it("requires exact scope targets", () => {
    expect(exceptionSchema.safeParse({ ...input, sedeId: 1 }).success).toBe(
      false,
    );
    expect(
      exceptionSchema.safeParse({ ...input, alcance: "AREA" }).success,
    ).toBe(false);
    expect(
      exceptionSchema.safeParse({ ...input, alcance: "AREA", areaId: 2 })
        .success,
    ).toBe(true);
  });
  it("rejects invalid dates, reverse ranges and unbounded periods", () => {
    for (const change of [
      { fechaInicio: "2026-02-30" },
      { fechaFin: "2026-10-01" },
      { fechaFin: "2028-10-01" },
    ])
      expect(exceptionSchema.safeParse({ ...input, ...change }).success).toBe(
        false,
      );
  });
  it("requires special hours and never accepts equivalent-hour credits", () => {
    expect(
      exceptionSchema.safeParse({ ...input, efecto: "HORARIO_ESPECIAL" })
        .success,
    ).toBe(false);
    expect(
      exceptionSchema.safeParse({ ...input, horasEquivalentes: 8 }).success,
    ).toBe(false);
    expect(
      exceptionSchema.safeParse({
        ...input,
        efecto: "HORARIO_ESPECIAL",
        horaInicio: "08:00:00",
        horaFin: "10:00:00",
      }).success,
    ).toBe(true);
  });
});
describe("retrospective calendar mutation", () => {
  it("requires a durable preview", async () => {
    const d = deps();
    await expect(
      d.service.create(actor, "create-key", input),
    ).rejects.toMatchObject({ code: "CALENDAR_PREVIEW_REQUIRED" });
    expect(d.tx.excepcionCalendario.create).not.toHaveBeenCalled();
  });
  it("preview counts impact without changing business records", async () => {
    const d = deps();
    const result: any = await d.service.preview(actor, "preview-key", input);
    expect(result.users).toBe(1);
    expect(d.tx.excepcionCalendario.create).not.toHaveBeenCalled();
    expect(d.tx.ausencia.update).not.toHaveBeenCalled();
    expect(d.audit.append.mock.calls[0][1]).toBe(d.tx);
  });
  it("accepts the exact unexpired impact", async () => {
    const d = deps();
    const preview: any = await d.service.preview(actor, "preview-key", input);
    await expect(
      d.service.create(actor, "create-key", input, preview.previewId),
    ).resolves.toMatchObject({ titulo: input.titulo });
    expect(d.tx.calendarRevision.update).toHaveBeenCalledOnce();
  });
  it("invalidates the preview when a relevant absence changes", async () => {
    const d = deps();
    const preview: any = await d.service.preview(actor, "preview-key", input);
    d.tx.ausencia.findMany.mockResolvedValue([
      { id: "a", version: 2, estado: "PENDIENTE_JUSTIFICACION" },
    ]);
    await expect(
      d.service.create(actor, "create-key", input, preview.previewId),
    ).rejects.toMatchObject({ code: "CALENDAR_PREVIEW_STALE" });
  });
  it("invalidates expired previews", async () => {
    const d = deps();
    const preview: any = await d.service.preview(actor, "preview-key", input);
    vi.advanceTimersByTime(16 * 60000);
    await expect(
      d.service.create(actor, "create-key", input, preview.previewId),
    ).rejects.toMatchObject({ code: "CALENDAR_PREVIEW_STALE" });
  });
  it("requires explicit ADMIN confirmation for definitive records", async () => {
    const d = deps();
    d.tx.ausencia.findMany.mockResolvedValue([
      {
        id: "a",
        userId: 5,
        sedeId: 1,
        areaId: 2,
        fecha: new Date("2026-10-08"),
        version: 1,
        estado: "NO_JUSTIFICADA",
      },
    ]);
    const preview: any = await d.service.preview(actor, "preview-key", input);
    await expect(
      d.service.create(actor, "create-key", input, preview.previewId),
    ).rejects.toMatchObject({ code: "CALENDAR_ADMIN_CONFIRMATION_REQUIRED" });
    await d.service.create(
      actor,
      "create-confirmed-key",
      input,
      preview.previewId,
      true,
    );
    expect(d.tx.ausencia.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: "CANCELADA" }),
      }),
    );
  });
  it("a personal work exception outranks a global suspension", async () => {
    const d = deps();
    d.tx.ausencia.findMany.mockResolvedValue([
      {
        id: "a",
        userId: 5,
        sedeId: 1,
        areaId: 2,
        fecha: new Date("2026-10-08"),
        version: 1,
        estado: "PENDIENTE_JUSTIFICACION",
      },
    ]);
    d.setRows([
      {
        id: "personal",
        alcance: "USUARIO",
        efecto: "ASISTENCIA_EXTRAORDINARIA",
        createdAt: new Date(),
      },
    ]);
    const preview: any = await d.service.preview(actor, "preview-key", input);
    await d.service.create(actor, "create-key", input, preview.previewId);
    expect(d.tx.ausencia.update).not.toHaveBeenCalled();
  });
  it("does not let an area manager create GLOBAL exceptions", async () => {
    const d = deps();
    const manager = { ...actor, rol: "COORDINADOR" };
    d.tx.usuario.findUnique.mockResolvedValue(manager);
    await expect(
      d.service.preview(manager as any, "preview-key", input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("denies another area", async () => {
    const d = deps();
    const manager = { ...actor, rol: "COORDINADOR" };
    d.tx.usuario.findUnique.mockResolvedValue(manager);
    d.tx.area.findUnique.mockResolvedValue({ id: 8, sedeId: 1 });
    await expect(
      d.service.preview(manager as any, "preview-key", {
        ...input,
        alcance: "AREA",
        areaId: 8,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("protects historical ownership after a user has moved", async () => {
    const d = deps();
    const manager = { ...actor, rol: "COORDINADOR" };
    d.tx.usuario.findUnique.mockResolvedValue(manager);
    d.tx.ausencia.findMany.mockResolvedValue([
      { id: "old", userId: 9, areaId: 8, sedeId: 1 },
    ]);
    await expect(
      d.service.preview(manager as any, "preview-key", {
        ...input,
        alcance: "USUARIO",
        usuarioId: 9,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("OpenAPI requires idempotency on every new mutation", () => {
    for (const path of Object.values(absenceCalendarPaths))
      for (const method of ["post", "delete"]) {
        const operation = (path as any)[method];
        if (operation)
          expect(operation.parameters).toContainEqual(
            expect.objectContaining({
              name: "Idempotency-Key",
              required: true,
            }),
          );
      }
  });
});
