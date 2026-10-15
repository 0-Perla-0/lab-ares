import { describe, expect, it, vi } from "vitest";
import { ServicePeriodsService } from "../../../src/documents/service-periods.service";
import {
  servicePeriodCreateSchema,
  servicePeriodTransitionSchema,
} from "../../../src/documents/service-periods.schemas";
const actor: any = {
  id: 1,
  rol: "COORDINADOR",
  estado: "ACTIVA",
  sedeId: 2,
  areaId: 3,
};
const subject = {
  id: 2,
  rol: "PRESTADOR",
  estado: "ACTIVA",
  sedeId: 2,
  areaId: 3,
};
const formalization = {
  id: "c123456789012345678901",
  usuarioId: 2,
  inicio: new Date("2026-10-12"),
  adscripcion: {
    estado: "CONFIRMADA",
    inicio: new Date("2026-01-01"),
    fin: null,
  },
};
const period = {
  id: "c123456789012345678902",
  usuarioId: 2,
  formalizacionId: formalization.id,
  inicio: formalization.inicio,
  fin: new Date("2027-01-31"),
  estado: "REGISTRADO",
  version: 1,
  formalizacion: formalization,
};
function make() {
  const tx: any = {
    $queryRaw: vi.fn(),
    usuario: {
      findUnique: vi.fn(({ where }) =>
        Promise.resolve(where.id === 1 ? actor : subject),
      ),
    },
    recoveryWriteBarrier: {
      findUnique: vi.fn().mockResolvedValue({ active: false }),
    },
    domainOperation: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    formalizacionExpediente: {
      findUnique: vi.fn().mockResolvedValue(formalization),
    },
    periodoServicio: {
      findUnique: vi.fn().mockResolvedValue(period),
      findUniqueOrThrow: vi.fn().mockResolvedValue(period),
      create: vi.fn().mockResolvedValue(period),
      update: vi.fn(({ data }) =>
        Promise.resolve({ ...period, estado: data.estado, version: 2 }),
      ),
    },
    eventoPeriodoServicio: { create: vi.fn() },
    notification: { create: vi.fn().mockResolvedValue({ id: "notice" }) },
    outboxEvent: { create: vi.fn() },
  };
  const db: any = { $transaction: vi.fn((fn) => fn(tx)) };
  const audit: any = { append: vi.fn() },
    features: any = { requireInTransaction: vi.fn() };
  return {
    service: new ServicePeriodsService(db, audit, features),
    tx,
    audit,
    features,
  };
}
describe("operational service periods", () => {
  it("rejects unknown fields, invalid dates and missing reasons", () => {
    expect(
      servicePeriodCreateSchema.safeParse({
        formalizacionId: formalization.id,
        fin: "2026-02-30",
        motivo: "Valid reason",
      }).success,
    ).toBe(false);
    expect(
      servicePeriodTransitionSchema.safeParse({
        expectedVersion: 1,
        estado: "LIBERADO",
        motivo: "Valid reason",
      }).success,
    ).toBe(false);
    expect(
      servicePeriodTransitionSchema.safeParse({
        expectedVersion: 1,
        estado: "CERRADO",
        motivo: "Valid reason",
        hours: 480,
      }).success,
    ).toBe(false);
  });
  it("records an immutable event, audit, notice and receipt atomically", async () => {
    const h = make();
    h.tx.periodoServicio.findUnique.mockResolvedValue(null);
    await h.service.create(actor, "period-create-0001", {
      formalizacionId: formalization.id,
      fin: "2027-01-31",
      motivo: "Administrative registration",
    });
    expect(h.tx.eventoPeriodoServicio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 1, estado: "REGISTRADO" }),
    });
    expect(h.tx.domainOperation.create).toHaveBeenCalledOnce();
    expect(h.tx.outboxEvent.create).toHaveBeenCalledOnce();
  });
  it("rejects end before formalized start", async () => {
    const h = make();
    await expect(
      h.service.create(actor, "period-create-0002", {
        formalizacionId: formalization.id,
        fin: "2026-10-11",
        motivo: "Administrative registration",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_PERIOD_INVALID_DATES" });
    expect(h.tx.periodoServicio.create).not.toHaveBeenCalled();
  });
  it("rejects stale versions without appending an event", async () => {
    const h = make();
    await expect(
      h.service.transition(actor, "period-change-0001", period.id, {
        expectedVersion: 2,
        estado: "INICIADO",
        motivo: "Administrative initiation",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_PERIOD_VERSION_CHANGED" });
    expect(h.tx.eventoPeriodoServicio.create).not.toHaveBeenCalled();
  });
  it("cannot close a period that has not started", async () => {
    const h = make();
    await expect(
      h.service.transition(actor, "period-change-0002", period.id, {
        expectedVersion: 1,
        estado: "CERRADO",
        motivo: "Administrative closure",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_PERIOD_STATE_INVALID" });
  });
  it("checks approved academic coverage again before beginning", async () => {
    const h = make();
    h.tx.periodoServicio.findUniqueOrThrow.mockResolvedValue({
      ...period,
      formalizacion: {
        ...formalization,
        adscripcion: { ...formalization.adscripcion, estado: "RECHAZADA" },
      },
    });
    await expect(
      h.service.transition(actor, "period-change-0003", period.id, {
        expectedVersion: 1,
        estado: "INICIADO",
        motivo: "Administrative initiation",
      }),
    ).rejects.toMatchObject({ code: "ACADEMIC_FORMALIZATION_REQUIRED" });
  });
  it("allows closing existing work without checking the new-work feature", async () => {
    const h = make();
    h.tx.periodoServicio.findUniqueOrThrow.mockResolvedValue({
      ...period,
      estado: "INICIADO",
    });
    await h.service.transition(actor, "period-change-0004", period.id, {
      expectedVersion: 1,
      estado: "CERRADO",
      motivo: "Administrative closure",
    });
    expect(h.features.requireInTransaction).not.toHaveBeenCalled();
    expect(h.tx.periodoServicio.update).toHaveBeenCalledWith({
      where: { id: period.id },
      data: { estado: "CERRADO", version: { increment: 1 } },
    });
  });
  it("does not expose or mutate an out-of-scope period", async () => {
    const h = make();
    h.tx.usuario.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id === 1 ? actor : { ...subject, sedeId: 99 }),
    );
    await expect(
      h.service.transition(actor, "period-change-0005", period.id, {
        expectedVersion: 1,
        estado: "INICIADO",
        motivo: "Administrative initiation",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_PERIOD_NOT_FOUND" });
  });
});
