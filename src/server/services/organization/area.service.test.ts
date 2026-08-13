import { beforeEach, describe, expect, it, vi } from "vitest";

import { UniqueConstraintError } from "../../errors/unique-constraint-error";
import * as areaRepository from "../../repositories/area.repository";
import * as sedeRepository from "../../repositories/sede.repository";

import {
  actualizarArea,
  crearArea,
  desactivarArea,
  obtenerArea,
} from "./area.service";

vi.mock("../../repositories/area.repository", () => ({
  findAllActivas: vi.fn(),
  findById: vi.fn(),
  findByNombreEnSede: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  reactivate: vi.fn(),
  deactivate: vi.fn(),
}));

vi.mock("../../repositories/sede.repository", () => ({
  findById: vi.fn(),
}));

const mockedArea = vi.mocked(areaRepository);
const mockedSede = vi.mocked(sedeRepository);

const fecha = new Date("2026-01-01T00:00:00.000Z");

const sede = {
  id: 1,
  nombre: "CUCEI Centro",
  direccion: null,
  activa: true,
  createdAt: fecha,
  updatedAt: fecha,
};

const area = {
  id: 10,
  nombre: "Desarrollo",
  activa: true,
  sedeId: sede.id,
  createdAt: fecha,
  updatedAt: fecha,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("crearArea", () => {
  it("crea el área cuando la sede está activa y el nombre está libre", async () => {
    mockedSede.findById.mockResolvedValue(sede);
    mockedArea.findByNombreEnSede.mockResolvedValue(null);
    mockedArea.create.mockResolvedValue(area);

    await crearArea({ nombre: "Desarrollo", sedeId: 1 });

    expect(mockedArea.create).toHaveBeenCalledWith({
      nombre: "Desarrollo",
      sedeId: 1,
    });
  });

  it("rechaza con SEDE_NOT_FOUND si la sede no existe", async () => {
    mockedSede.findById.mockResolvedValue(null);

    await expect(
      crearArea({ nombre: "Desarrollo", sedeId: 99 }),
    ).rejects.toThrow(
      expect.objectContaining({ kind: "NOT_FOUND", code: "SEDE_NOT_FOUND" }),
    );
    expect(mockedArea.create).not.toHaveBeenCalled();
  });

  it("rechaza con SEDE_INACTIVE si la sede está dada de baja", async () => {
    mockedSede.findById.mockResolvedValue({ ...sede, activa: false });

    await expect(
      crearArea({ nombre: "Desarrollo", sedeId: 1 }),
    ).rejects.toThrow(
      expect.objectContaining({ kind: "CONFLICT", code: "SEDE_INACTIVE" }),
    );
    expect(mockedArea.create).not.toHaveBeenCalled();
  });

  it("rechaza un nombre repetido dentro de la misma sede", async () => {
    mockedSede.findById.mockResolvedValue(sede);
    mockedArea.findByNombreEnSede.mockResolvedValue(area);

    await expect(
      crearArea({ nombre: "Desarrollo", sedeId: 1 }),
    ).rejects.toThrow(
      expect.objectContaining({
        kind: "CONFLICT",
        code: "AREA_ALREADY_EXISTS",
      }),
    );
  });

  it("reactiva el área dada de baja en vez de fallar", async () => {
    const inactiva = { ...area, activa: false };
    mockedSede.findById.mockResolvedValue(sede);
    mockedArea.findByNombreEnSede.mockResolvedValue(inactiva);
    mockedArea.reactivate.mockResolvedValue(area);

    const resultado = await crearArea({ nombre: "Desarrollo", sedeId: 1 });

    expect(mockedArea.reactivate).toHaveBeenCalledWith(inactiva.id, {
      nombre: "Desarrollo",
      sedeId: 1,
    });
    expect(mockedArea.create).not.toHaveBeenCalled();
    expect(resultado.activa).toBe(true);
  });

  it("busca duplicados solo dentro de la sede indicada", async () => {
    mockedSede.findById.mockResolvedValue(sede);
    mockedArea.findByNombreEnSede.mockResolvedValue(null);
    mockedArea.create.mockResolvedValue(area);

    await crearArea({ nombre: "Desarrollo", sedeId: 1 });

    expect(mockedArea.findByNombreEnSede).toHaveBeenCalledWith(1, "Desarrollo");
  });

  it("convierte la carrera del índice único en CONFLICT", async () => {
    mockedSede.findById.mockResolvedValue(sede);
    mockedArea.findByNombreEnSede.mockResolvedValue(null);
    mockedArea.create.mockRejectedValue(new UniqueConstraintError());

    await expect(
      crearArea({ nombre: "Desarrollo", sedeId: 1 }),
    ).rejects.toThrow(
      expect.objectContaining({
        kind: "CONFLICT",
        code: "AREA_ALREADY_EXISTS",
      }),
    );
  });
});

describe("obtenerArea", () => {
  it("devuelve el área aunque esté inactiva", async () => {
    const inactiva = { ...area, activa: false };
    mockedArea.findById.mockResolvedValue(inactiva);

    await expect(obtenerArea(10)).resolves.toEqual(inactiva);
  });

  it("lanza AREA_NOT_FOUND cuando no existe", async () => {
    mockedArea.findById.mockResolvedValue(null);

    await expect(obtenerArea(999)).rejects.toThrow(
      expect.objectContaining({ kind: "NOT_FOUND", code: "AREA_NOT_FOUND" }),
    );
  });
});

describe("actualizarArea", () => {
  it("comprueba duplicados contra la sede destino al mover el área", async () => {
    mockedArea.findById.mockResolvedValue(area);
    mockedSede.findById.mockResolvedValue({ ...sede, id: 2 });
    mockedArea.findByNombreEnSede.mockResolvedValue(null);
    mockedArea.update.mockResolvedValue({ ...area, sedeId: 2 });

    await actualizarArea(10, { sedeId: 2 });

    expect(mockedSede.findById).toHaveBeenCalledWith(2);
    expect(mockedArea.findByNombreEnSede).toHaveBeenCalledWith(
      2,
      "Desarrollo",
      10,
    );
  });

  it("no permite mover el área a una sede inactiva", async () => {
    mockedArea.findById.mockResolvedValue(area);
    mockedSede.findById.mockResolvedValue({ ...sede, id: 2, activa: false });

    await expect(actualizarArea(10, { sedeId: 2 })).rejects.toThrow(
      expect.objectContaining({ kind: "CONFLICT", code: "SEDE_INACTIVE" }),
    );
    expect(mockedArea.update).not.toHaveBeenCalled();
  });

  it("falla con AREA_NOT_FOUND antes de escribir", async () => {
    mockedArea.findById.mockResolvedValue(null);

    await expect(actualizarArea(999, { nombre: "X" })).rejects.toThrow(
      expect.objectContaining({ code: "AREA_NOT_FOUND" }),
    );
    expect(mockedArea.update).not.toHaveBeenCalled();
  });
});

describe("desactivarArea", () => {
  it("da de baja un área activa", async () => {
    mockedArea.findById.mockResolvedValue(area);
    mockedArea.deactivate.mockResolvedValue({ ...area, activa: false });

    const resultado = await desactivarArea(10);

    expect(resultado.activa).toBe(false);
    expect(mockedArea.deactivate).toHaveBeenCalledWith(10);
  });

  it("es idempotente con un área ya inactiva", async () => {
    mockedArea.findById.mockResolvedValue({ ...area, activa: false });

    await desactivarArea(10);

    expect(mockedArea.deactivate).not.toHaveBeenCalled();
  });
});
