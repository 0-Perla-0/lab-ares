import { beforeEach, describe, expect, it, vi } from "vitest";

import { DiaSemana } from "../../../generated/prisma/enums";
import { UniqueConstraintError } from "../../errors/unique-constraint-error";
import * as areaRepository from "../../repositories/area.repository";
import * as turnoRepository from "../../repositories/turno.repository";

import {
  actualizarTurno,
  crearTurno,
  desactivarTurno,
  listarTurnos,
  obtenerTurno,
} from "./turno.service";

vi.mock("../../repositories/turno.repository", () => ({
  findAllActivos: vi.fn(),
  findById: vi.fn(),
  findByNombreEnArea: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  reactivate: vi.fn(),
  deactivate: vi.fn(),
}));

vi.mock("../../repositories/area.repository", () => ({
  findById: vi.fn(),
}));

const mockedTurno = vi.mocked(turnoRepository);
const mockedArea = vi.mocked(areaRepository);

const fecha = new Date("2026-01-01T00:00:00.000Z");

const area = {
  id: 5,
  nombre: "Desarrollo",
  activa: true,
  sedeId: 1,
  createdAt: fecha,
  updatedAt: fecha,
};

/** 08:00 y 12:30 tal y como los guarda Prisma para un TIME(0). */
const turno = {
  id: 7,
  nombre: "Matutino",
  horaInicio: new Date(Date.UTC(1970, 0, 1, 8, 0)),
  horaFin: new Date(Date.UTC(1970, 0, 1, 12, 30)),
  activo: true,
  areaId: area.id,
  dias: [
    { turnoId: 7, dia: DiaSemana.LUNES },
    { turnoId: 7, dia: DiaSemana.MIERCOLES },
  ],
  createdAt: fecha,
  updatedAt: fecha,
};

const entrada = {
  nombre: "Matutino",
  areaId: area.id,
  horaInicio: 8 * 60,
  horaFin: 12 * 60 + 30,
  dias: [DiaSemana.LUNES, DiaSemana.MIERCOLES],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("forma pública del turno", () => {
  it("saca las horas como HH:MM en UTC y los días como lista plana", async () => {
    mockedTurno.findById.mockResolvedValue(turno);

    await expect(obtenerTurno(7)).resolves.toEqual({
      id: 7,
      nombre: "Matutino",
      horaInicio: "08:00",
      horaFin: "12:30",
      activo: true,
      areaId: 5,
      dias: ["LUNES", "MIERCOLES"],
      createdAt: fecha,
      updatedAt: fecha,
    });
  });

  it("no desplaza la hora por la zona horaria del servidor", async () => {
    mockedTurno.findById.mockResolvedValue({
      ...turno,
      horaInicio: new Date(Date.UTC(1970, 0, 1, 0, 15)),
    });

    const resultado = await obtenerTurno(7);

    expect(resultado.horaInicio).toBe("00:15");
  });

  it("mapea la lista completa", async () => {
    mockedTurno.findAllActivos.mockResolvedValue([turno]);

    const [primero] = await listarTurnos();

    expect(primero?.horaFin).toBe("12:30");
  });
});

describe("crearTurno", () => {
  it("convierte los minutos a la fecha que espera Prisma", async () => {
    mockedArea.findById.mockResolvedValue(area);
    mockedTurno.findByNombreEnArea.mockResolvedValue(null);
    mockedTurno.create.mockResolvedValue(turno);

    await crearTurno(entrada);

    expect(mockedTurno.create).toHaveBeenCalledWith({
      nombre: "Matutino",
      areaId: 5,
      horaInicio: new Date(Date.UTC(1970, 0, 1, 8, 0)),
      horaFin: new Date(Date.UTC(1970, 0, 1, 12, 30)),
      dias: ["LUNES", "MIERCOLES"],
    });
  });

  it("rechaza con AREA_NOT_FOUND si el área no existe", async () => {
    mockedArea.findById.mockResolvedValue(null);

    await expect(crearTurno(entrada)).rejects.toThrow(
      expect.objectContaining({ kind: "NOT_FOUND", code: "AREA_NOT_FOUND" }),
    );
    expect(mockedTurno.create).not.toHaveBeenCalled();
  });

  it("rechaza con AREA_INACTIVE si el área está dada de baja", async () => {
    mockedArea.findById.mockResolvedValue({ ...area, activa: false });

    await expect(crearTurno(entrada)).rejects.toThrow(
      expect.objectContaining({ kind: "CONFLICT", code: "AREA_INACTIVE" }),
    );
    expect(mockedTurno.create).not.toHaveBeenCalled();
  });

  it("rechaza un nombre repetido dentro de la misma área", async () => {
    mockedArea.findById.mockResolvedValue(area);
    mockedTurno.findByNombreEnArea.mockResolvedValue(turno);

    await expect(crearTurno(entrada)).rejects.toThrow(
      expect.objectContaining({
        kind: "CONFLICT",
        code: "TURNO_ALREADY_EXISTS",
      }),
    );
  });

  it("reactiva el turno dado de baja con el horario y los días nuevos", async () => {
    mockedArea.findById.mockResolvedValue(area);
    mockedTurno.findByNombreEnArea.mockResolvedValue({
      ...turno,
      activo: false,
    });
    mockedTurno.reactivate.mockResolvedValue(turno);

    await crearTurno({ ...entrada, dias: ["VIERNES"] });

    expect(mockedTurno.reactivate).toHaveBeenCalledWith(
      turno.id,
      expect.objectContaining({ dias: ["VIERNES"] }),
    );
    expect(mockedTurno.create).not.toHaveBeenCalled();
  });

  it("convierte la carrera del índice único en CONFLICT", async () => {
    mockedArea.findById.mockResolvedValue(area);
    mockedTurno.findByNombreEnArea.mockResolvedValue(null);
    mockedTurno.create.mockRejectedValue(new UniqueConstraintError());

    await expect(crearTurno(entrada)).rejects.toThrow(
      expect.objectContaining({
        kind: "CONFLICT",
        code: "TURNO_ALREADY_EXISTS",
      }),
    );
  });
});

describe("actualizarTurno", () => {
  beforeEach(() => {
    mockedTurno.findById.mockResolvedValue(turno);
    mockedArea.findById.mockResolvedValue(area);
    mockedTurno.findByNombreEnArea.mockResolvedValue(null);
    mockedTurno.update.mockResolvedValue(turno);
  });

  it("manda solo los campos recibidos", async () => {
    await actualizarTurno(7, { dias: ["SABADO"] });

    expect(mockedTurno.update).toHaveBeenCalledWith(7, { dias: ["SABADO"] });
  });

  it("compara una hora suelta contra la que ya está guardada", async () => {
    // el turno va de 08:00 a 12:30; mover el fin a las 07:00 lo invierte
    await expect(actualizarTurno(7, { horaFin: 7 * 60 })).rejects.toThrow(
      expect.objectContaining({
        kind: "INVALID_INPUT",
        code: "TURNO_HORARIO_INVALIDO",
      }),
    );
    expect(mockedTurno.update).not.toHaveBeenCalled();
  });

  it("acepta una hora suelta que sigue siendo coherente", async () => {
    await actualizarTurno(7, { horaFin: 14 * 60 });

    expect(mockedTurno.update).toHaveBeenCalledWith(7, {
      horaFin: new Date(Date.UTC(1970, 0, 1, 14, 0)),
    });
  });

  it("rechaza mover el turno a un área inactiva", async () => {
    mockedArea.findById.mockResolvedValue({ ...area, id: 9, activa: false });

    await expect(actualizarTurno(7, { areaId: 9 })).rejects.toThrow(
      expect.objectContaining({ code: "AREA_INACTIVE" }),
    );
    expect(mockedTurno.update).not.toHaveBeenCalled();
  });

  it("comprueba duplicados en el área destino excluyéndose a sí mismo", async () => {
    await actualizarTurno(7, { areaId: 9 });

    expect(mockedTurno.findByNombreEnArea).toHaveBeenCalledWith(
      9,
      "Matutino",
      7,
    );
  });

  it("falla con TURNO_NOT_FOUND antes de escribir", async () => {
    mockedTurno.findById.mockResolvedValue(null);

    await expect(actualizarTurno(999, { nombre: "X" })).rejects.toThrow(
      expect.objectContaining({ code: "TURNO_NOT_FOUND" }),
    );
    expect(mockedTurno.update).not.toHaveBeenCalled();
  });
});

describe("desactivarTurno", () => {
  it("da de baja un turno activo", async () => {
    mockedTurno.findById.mockResolvedValue(turno);
    mockedTurno.deactivate.mockResolvedValue({ ...turno, activo: false });

    const resultado = await desactivarTurno(7);

    expect(resultado.activo).toBe(false);
    expect(mockedTurno.deactivate).toHaveBeenCalledWith(7);
  });

  it("es idempotente con un turno ya inactivo", async () => {
    mockedTurno.findById.mockResolvedValue({ ...turno, activo: false });

    await desactivarTurno(7);

    expect(mockedTurno.deactivate).not.toHaveBeenCalled();
  });
});
