import { beforeEach, describe, expect, it, vi } from "vitest";

import { UniqueConstraintError } from "../../common/errors/unique-constraint-error";
import type { AreaRepository } from "../repositories/area.repository";
import type { SedeRepository } from "../repositories/sede.repository";
import { AreaService } from "./area.service";

const areas = {
  findAllActivas: vi.fn(),
  findById: vi.fn(),
  findByNombreEnSede: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  reactivate: vi.fn(),
  deactivateCascade: vi.fn(),
};
const sedes = { findById: vi.fn() };
const service = new AreaService(
  areas as unknown as AreaRepository,
  sedes as unknown as SedeRepository,
);
const now = new Date("2026-01-01T00:00:00.000Z");
const activeSede = {
  id: 1,
  nombre: "Centro",
  direccion: null,
  activa: true,
  createdAt: now,
  updatedAt: now,
};
const activeArea = {
  id: 2,
  nombre: "Desarrollo",
  activa: true,
  sedeId: 1,
  createdAt: now,
  updatedAt: now,
};

describe("AreaService", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates an area under an active sede", async () => {
    sedes.findById.mockResolvedValue(activeSede);
    areas.findByNombreEnSede.mockResolvedValue(null);
    areas.create.mockResolvedValue(activeArea);
    await expect(
      service.crear({ nombre: "Desarrollo", sedeId: 1 }),
    ).resolves.toEqual(activeArea);
  });

  it("rejects a missing sede", async () => {
    sedes.findById.mockResolvedValue(null);
    await expect(
      service.crear({ nombre: "Desarrollo", sedeId: 99 }),
    ).rejects.toMatchObject({ code: "SEDE_NOT_FOUND" });
  });

  it("rejects an inactive sede", async () => {
    sedes.findById.mockResolvedValue({ ...activeSede, activa: false });
    await expect(
      service.crear({ nombre: "Desarrollo", sedeId: 1 }),
    ).rejects.toMatchObject({ code: "SEDE_INACTIVE" });
  });

  it("rejects an active duplicate in the same sede", async () => {
    sedes.findById.mockResolvedValue(activeSede);
    areas.findByNombreEnSede.mockResolvedValue(activeArea);
    await expect(
      service.crear({ nombre: "Desarrollo", sedeId: 1 }),
    ).rejects.toMatchObject({ code: "AREA_ALREADY_EXISTS" });
  });

  it("reactivates an inactive duplicate", async () => {
    sedes.findById.mockResolvedValue(activeSede);
    areas.findByNombreEnSede.mockResolvedValue({
      ...activeArea,
      activa: false,
    });
    areas.reactivate.mockResolvedValue(activeArea);
    await service.crear({ nombre: "Desarrollo", sedeId: 1 });
    expect(areas.reactivate).toHaveBeenCalledWith(2, {
      nombre: "Desarrollo",
      sedeId: 1,
    });
  });

  it("maps a unique-index race to AREA_ALREADY_EXISTS", async () => {
    sedes.findById.mockResolvedValue(activeSede);
    areas.findByNombreEnSede.mockResolvedValue(null);
    areas.create.mockRejectedValue(new UniqueConstraintError());
    await expect(
      service.crear({ nombre: "Desarrollo", sedeId: 1 }),
    ).rejects.toMatchObject({ code: "AREA_ALREADY_EXISTS" });
  });

  it("uses the destination sede when moving an area", async () => {
    areas.findById.mockResolvedValue(activeArea);
    sedes.findById.mockResolvedValue({ ...activeSede, id: 3 });
    areas.findByNombreEnSede.mockResolvedValue(null);
    areas.update.mockResolvedValue({ ...activeArea, sedeId: 3 });
    await service.actualizar(2, { sedeId: 3 });
    expect(areas.findByNombreEnSede).toHaveBeenCalledWith(3, "Desarrollo", 2);
  });

  it("returns inactive areas by id but keeps delete idempotent", async () => {
    areas.findById.mockResolvedValue({ ...activeArea, activa: false });
    await expect(service.obtener(2)).resolves.toMatchObject({ activa: false });
    await service.desactivar(2);
    expect(areas.deactivateCascade).not.toHaveBeenCalled();
  });

  it("cascades deletion for an active area", async () => {
    areas.findById.mockResolvedValue(activeArea);
    areas.deactivateCascade.mockResolvedValue({ ...activeArea, activa: false });
    await service.desactivar(2);
    expect(areas.deactivateCascade).toHaveBeenCalledWith(2);
  });
});
