import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "../../errors/domain-error";
import { UniqueConstraintError } from "../../errors/unique-constraint-error";
import * as sedeRepository from "../../repositories/sede.repository";

import {
  actualizarSede,
  crearSede,
  desactivarSede,
  obtenerSede,
} from "./sede.service";

vi.mock("../../repositories/sede.repository", () => ({
  findAllActivas: vi.fn(),
  findById: vi.fn(),
  findByNombre: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  reactivate: vi.fn(),
  deactivateCascade: vi.fn(),
}));

const mocked = vi.mocked(sedeRepository);

const sede = {
  id: 1,
  nombre: "CUCEI Centro",
  direccion: null,
  activa: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("obtenerSede", () => {
  it("devuelve la sede aunque esté inactiva", async () => {
    const inactiva = { ...sede, activa: false };
    mocked.findById.mockResolvedValue(inactiva);

    await expect(obtenerSede(1)).resolves.toEqual(inactiva);
  });

  it("lanza SEDE_NOT_FOUND cuando no existe", async () => {
    mocked.findById.mockResolvedValue(null);

    await expect(obtenerSede(999)).rejects.toThrow(
      expect.objectContaining({ kind: "NOT_FOUND", code: "SEDE_NOT_FOUND" }),
    );
  });
});

describe("crearSede", () => {
  it("normaliza direccion ausente a null", async () => {
    mocked.findByNombre.mockResolvedValue(null);
    mocked.create.mockResolvedValue(sede);

    await crearSede({ nombre: "CUCEI Centro" });

    expect(mocked.create).toHaveBeenCalledWith({
      nombre: "CUCEI Centro",
      direccion: null,
    });
  });

  it("lanza SEDE_ALREADY_EXISTS si el nombre lo tiene una sede activa", async () => {
    mocked.findByNombre.mockResolvedValue(sede);

    await expect(crearSede({ nombre: "CUCEI Centro" })).rejects.toThrow(
      expect.objectContaining({
        kind: "CONFLICT",
        code: "SEDE_ALREADY_EXISTS",
      }),
    );
    expect(mocked.create).not.toHaveBeenCalled();
  });

  it("reactiva la sede dada de baja en vez de fallar", async () => {
    const inactiva = { ...sede, activa: false };
    mocked.findByNombre.mockResolvedValue(inactiva);
    mocked.reactivate.mockResolvedValue(sede);

    const resultado = await crearSede({
      nombre: "CUCEI Centro",
      direccion: "Nueva dirección",
    });

    expect(mocked.reactivate).toHaveBeenCalledWith(inactiva.id, {
      nombre: "CUCEI Centro",
      direccion: "Nueva dirección",
    });
    expect(mocked.create).not.toHaveBeenCalled();
    expect(resultado.activa).toBe(true);
  });

  it("convierte la carrera del índice único en CONFLICT, no en un 500", async () => {
    mocked.findByNombre.mockResolvedValue(null);
    mocked.create.mockRejectedValue(new UniqueConstraintError());

    await expect(crearSede({ nombre: "CUCEI Centro" })).rejects.toThrow(
      expect.objectContaining({
        kind: "CONFLICT",
        code: "SEDE_ALREADY_EXISTS",
      }),
    );
  });

  it("deja pasar cualquier otro error sin disfrazarlo", async () => {
    const caida = new Error("connection lost");
    mocked.findByNombre.mockResolvedValue(null);
    mocked.create.mockRejectedValue(caida);

    await expect(crearSede({ nombre: "CUCEI Centro" })).rejects.toBe(caida);
  });
});

describe("actualizarSede", () => {
  it("no comprueba duplicados si no llega nombre", async () => {
    mocked.findById.mockResolvedValue(sede);
    mocked.update.mockResolvedValue(sede);

    await actualizarSede(1, { direccion: "Nueva" });

    expect(mocked.findByNombre).not.toHaveBeenCalled();
    expect(mocked.update).toHaveBeenCalledWith(1, { direccion: "Nueva" });
  });

  it("excluye la propia sede al comprobar el nombre", async () => {
    mocked.findById.mockResolvedValue(sede);
    mocked.findByNombre.mockResolvedValue(null);
    mocked.update.mockResolvedValue(sede);

    await actualizarSede(1, { nombre: "CUCEI Centro" });

    expect(mocked.findByNombre).toHaveBeenCalledWith("CUCEI Centro", 1);
  });

  it("falla con SEDE_NOT_FOUND antes de escribir", async () => {
    mocked.findById.mockResolvedValue(null);

    await expect(actualizarSede(999, { nombre: "X" })).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(mocked.update).not.toHaveBeenCalled();
  });
});

describe("desactivarSede", () => {
  it("da de baja la sede arrastrando sus áreas", async () => {
    mocked.findById.mockResolvedValue(sede);
    mocked.deactivateCascade.mockResolvedValue({ ...sede, activa: false });

    const resultado = await desactivarSede(1);

    expect(resultado.activa).toBe(false);
    expect(mocked.deactivateCascade).toHaveBeenCalledWith(1);
  });

  it("es idempotente: no reescribe una sede ya inactiva", async () => {
    const inactiva = { ...sede, activa: false };
    mocked.findById.mockResolvedValue(inactiva);

    const resultado = await desactivarSede(1);

    expect(resultado).toEqual(inactiva);
    expect(mocked.deactivateCascade).not.toHaveBeenCalled();
  });
});
