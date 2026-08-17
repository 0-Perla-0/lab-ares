import { beforeEach, describe, expect, it, vi } from "vitest";

import { UniqueConstraintError } from "../../../src/common/errors/unique-constraint-error";
import type { SedeRepository } from "../../../src/organization/repositories/sede.repository";
import { SedeService } from "../../../src/organization/services/sede.service";

const repository = {
  findAllActivas: vi.fn(),
  findById: vi.fn(),
  findByNombre: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  reactivate: vi.fn(),
  deactivateCascade: vi.fn(),
};
const service = new SedeService(repository as unknown as SedeRepository);
const now = new Date("2026-01-01T00:00:00.000Z");
const active = {
  id: 1,
  nombre: "Centro",
  direccion: null,
  activa: true,
  createdAt: now,
  updatedAt: now,
};

describe("SedeService", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists active sedes", async () => {
    repository.findAllActivas.mockResolvedValue([active]);
    await expect(service.listar()).resolves.toEqual([active]);
  });

  it("returns an inactive sede by id", async () => {
    repository.findById.mockResolvedValue({ ...active, activa: false });
    await expect(service.obtener(1)).resolves.toMatchObject({ activa: false });
  });

  it("throws SEDE_NOT_FOUND when missing", async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.obtener(99)).rejects.toMatchObject({
      code: "SEDE_NOT_FOUND",
    });
  });

  it("normalizes a missing address to null", async () => {
    repository.findByNombre.mockResolvedValue(null);
    repository.create.mockResolvedValue(active);
    await service.crear({ nombre: "Centro" });
    expect(repository.create).toHaveBeenCalledWith({
      nombre: "Centro",
      direccion: null,
    });
  });

  it("rejects an active duplicate", async () => {
    repository.findByNombre.mockResolvedValue(active);
    await expect(service.crear({ nombre: "Centro" })).rejects.toMatchObject({
      code: "SEDE_ALREADY_EXISTS",
    });
  });

  it("reactivates an inactive duplicate", async () => {
    repository.findByNombre.mockResolvedValue({ ...active, activa: false });
    repository.reactivate.mockResolvedValue(active);
    await service.crear({ nombre: "Centro", direccion: "Nueva" });
    expect(repository.reactivate).toHaveBeenCalledWith(1, {
      nombre: "Centro",
      direccion: "Nueva",
    });
  });

  it("maps a unique-index race to the domain conflict", async () => {
    repository.findByNombre.mockResolvedValue(null);
    repository.create.mockRejectedValue(new UniqueConstraintError());
    await expect(service.crear({ nombre: "Centro" })).rejects.toMatchObject({
      code: "SEDE_ALREADY_EXISTS",
    });
  });

  it("updates only after checking existence", async () => {
    repository.findById.mockResolvedValue(active);
    repository.update.mockResolvedValue({ ...active, direccion: "Nueva" });
    await service.actualizar(1, { direccion: "Nueva" });
    expect(repository.findByNombre).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(1, { direccion: "Nueva" });
  });

  it("excludes itself when checking an updated name", async () => {
    repository.findById.mockResolvedValue(active);
    repository.findByNombre.mockResolvedValue(null);
    repository.update.mockResolvedValue(active);
    await service.actualizar(1, { nombre: "Norte" });
    expect(repository.findByNombre).toHaveBeenCalledWith("Norte", 1);
  });

  it("deactivates an active sede with its cascade", async () => {
    repository.findById.mockResolvedValue(active);
    repository.deactivateCascade.mockResolvedValue({
      ...active,
      activa: false,
    });
    await service.desactivar(1);
    expect(repository.deactivateCascade).toHaveBeenCalledWith(1);
  });

  it("does not rewrite an already inactive sede", async () => {
    repository.findById.mockResolvedValue({ ...active, activa: false });
    await service.desactivar(1);
    expect(repository.deactivateCascade).not.toHaveBeenCalled();
  });
});
