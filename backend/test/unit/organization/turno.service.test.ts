import { beforeEach, describe, expect, it, vi } from "vitest";

import { UniqueConstraintError } from "../../../src/common/errors/unique-constraint-error";
import { DiaSemana } from "../../../src/generated/prisma/enums";
import type { AreaRepository } from "../../../src/organization/repositories/area.repository";
import type { TurnoRepository } from "../../../src/organization/repositories/turno.repository";
import { TurnoService } from "../../../src/organization/services/turno.service";

const turnos = {
  findAllActivos: vi.fn(),
  findById: vi.fn(),
  findByNombreEnArea: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  reactivate: vi.fn(),
  deactivate: vi.fn(),
};
const areas = { findById: vi.fn() };
const service = new TurnoService(
  turnos as unknown as TurnoRepository,
  areas as unknown as AreaRepository,
);
const now = new Date("2026-01-01T00:00:00.000Z");
const area = {
  id: 1,
  nombre: "Desarrollo",
  activa: true,
  sedeId: 1,
  createdAt: now,
  updatedAt: now,
};
const turno = {
  id: 2,
  nombre: "Matutino",
  horaInicio: new Date("1970-01-01T08:00:00.000Z"),
  horaFin: new Date("1970-01-01T12:30:00.000Z"),
  activo: true,
  areaId: 1,
  createdAt: now,
  updatedAt: now,
  dias: [
    { turnoId: 2, dia: DiaSemana.LUNES },
    { turnoId: 2, dia: DiaSemana.MARTES },
  ],
};

describe("TurnoService", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the public HH:MM representation", async () => {
    turnos.findById.mockResolvedValue(turno);
    await expect(service.obtener(2)).resolves.toMatchObject({
      horaInicio: "08:00",
      horaFin: "12:30",
      dias: [DiaSemana.LUNES, DiaSemana.MARTES],
    });
  });

  it("maps the complete active list", async () => {
    turnos.findAllActivos.mockResolvedValue([turno]);
    await expect(service.listar()).resolves.toMatchObject([
      { nombre: "Matutino", horaInicio: "08:00" },
    ]);
  });

  it("converts input minutes to UTC dates when creating", async () => {
    areas.findById.mockResolvedValue(area);
    turnos.findByNombreEnArea.mockResolvedValue(null);
    turnos.create.mockImplementation(async (data) => ({ ...turno, ...data }));
    await service.crear({
      nombre: "Matutino",
      areaId: 1,
      horaInicio: 480,
      horaFin: 750,
      dias: [DiaSemana.LUNES],
    });
    expect(turnos.create).toHaveBeenCalledWith(
      expect.objectContaining({
        horaInicio: new Date("1970-01-01T08:00:00.000Z"),
        horaFin: new Date("1970-01-01T12:30:00.000Z"),
      }),
    );
  });

  it("rejects a missing area", async () => {
    areas.findById.mockResolvedValue(null);
    await expect(
      service.crear({
        nombre: "Matutino",
        areaId: 99,
        horaInicio: 480,
        horaFin: 750,
        dias: [DiaSemana.LUNES],
      }),
    ).rejects.toMatchObject({ code: "AREA_NOT_FOUND" });
  });

  it("rejects an inactive area", async () => {
    areas.findById.mockResolvedValue({ ...area, activa: false });
    await expect(
      service.crear({
        nombre: "Matutino",
        areaId: 1,
        horaInicio: 480,
        horaFin: 750,
        dias: [DiaSemana.LUNES],
      }),
    ).rejects.toMatchObject({ code: "AREA_INACTIVE" });
  });

  it("reactivates an inactive duplicate", async () => {
    areas.findById.mockResolvedValue(area);
    turnos.findByNombreEnArea.mockResolvedValue({ ...turno, activo: false });
    turnos.reactivate.mockResolvedValue(turno);
    await service.crear({
      nombre: "Matutino",
      areaId: 1,
      horaInicio: 480,
      horaFin: 750,
      dias: [DiaSemana.LUNES],
    });
    expect(turnos.reactivate).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ nombre: "Matutino" }),
    );
  });

  it("maps a unique-index race to TURNO_ALREADY_EXISTS", async () => {
    areas.findById.mockResolvedValue(area);
    turnos.findByNombreEnArea.mockResolvedValue(null);
    turnos.create.mockRejectedValue(new UniqueConstraintError());
    await expect(
      service.crear({
        nombre: "Matutino",
        areaId: 1,
        horaInicio: 480,
        horaFin: 750,
        dias: [DiaSemana.LUNES],
      }),
    ).rejects.toMatchObject({ code: "TURNO_ALREADY_EXISTS" });
  });

  it("checks a partial time update against stored time", async () => {
    turnos.findById.mockResolvedValue(turno);
    areas.findById.mockResolvedValue(area);
    turnos.findByNombreEnArea.mockResolvedValue(null);
    await expect(service.actualizar(2, { horaFin: 400 })).rejects.toMatchObject(
      {
        code: "TURNO_HORARIO_INVALIDO",
      },
    );
  });

  it("sends only received fields on update", async () => {
    turnos.findById.mockResolvedValue(turno);
    areas.findById.mockResolvedValue(area);
    turnos.findByNombreEnArea.mockResolvedValue(null);
    turnos.update.mockResolvedValue({ ...turno, nombre: "Temprano" });
    await service.actualizar(2, { nombre: "Temprano" });
    expect(turnos.update).toHaveBeenCalledWith(2, { nombre: "Temprano" });
  });

  it("keeps delete idempotent", async () => {
    turnos.findById.mockResolvedValue({ ...turno, activo: false });
    await service.desactivar(2);
    expect(turnos.deactivate).not.toHaveBeenCalled();
  });

  it("deactivates an active turno", async () => {
    turnos.findById.mockResolvedValue(turno);
    turnos.deactivate.mockResolvedValue({ ...turno, activo: false });
    await service.desactivar(2);
    expect(turnos.deactivate).toHaveBeenCalledWith(2);
  });
});
