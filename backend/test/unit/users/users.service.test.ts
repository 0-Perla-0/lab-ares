import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "../../../src/auth/password";
import { EstadoUsuario, RolUsuario } from "../../../src/generated/prisma/enums";
import type { AreaRepository } from "../../../src/organization/repositories/area.repository";
import type { SedeRepository } from "../../../src/organization/repositories/sede.repository";
import type { TurnoRepository } from "../../../src/organization/repositories/turno.repository";
import type { UsersRepository } from "../../../src/users/users.repository";
import { UsersService } from "../../../src/users/users.service";

vi.mock("../../../src/auth/password", () => ({ hashPassword: vi.fn() }));

const now = new Date("2026-08-20T00:00:00.000Z");
const user = {
  id: 10,
  codigo: "USER010",
  email: "user10@ares.local",
  rol: RolUsuario.PRESTADOR,
  estado: EstadoUsuario.ACTIVO,
  sedeId: 1,
  areaId: 2,
  turnoId: 3,
  createdAt: now,
  updatedAt: now,
};
const sede = { id: 1, activa: true };
const area = { id: 2, sedeId: 1, activa: true };
const turno = { id: 3, areaId: 2, activo: true };

const users = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findCollision: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};
const sedes = { findById: vi.fn() };
const areas = { findById: vi.fn() };
const turnos = { findById: vi.fn() };
const service = new UsersService(
  users as unknown as UsersRepository,
  sedes as unknown as SedeRepository,
  areas as unknown as AreaRepository,
  turnos as unknown as TurnoRepository,
);
const mockedHashPassword = vi.mocked(hashPassword);

describe("UsersService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    users.findById.mockResolvedValue(user);
    users.findCollision.mockResolvedValue(null);
    users.create.mockResolvedValue(user);
    users.update.mockResolvedValue(user);
    sedes.findById.mockResolvedValue(sede);
    areas.findById.mockResolvedValue(area);
    turnos.findById.mockResolvedValue(turno);
    mockedHashPassword.mockResolvedValue("password-hash");
  });

  it("validates assignments, hashes the password and creates a public user", async () => {
    await expect(
      service.crear({
        codigo: user.codigo,
        email: user.email,
        password: "A-secure-password-123!",
        rol: user.rol,
        estado: user.estado,
        sedeId: 1,
        areaId: 2,
        turnoId: 3,
      }),
    ).resolves.toBe(user);

    expect(mockedHashPassword).toHaveBeenCalledWith("A-secure-password-123!");
    expect(users.create).toHaveBeenCalledWith({
      codigo: user.codigo,
      email: user.email,
      passwordHash: "password-hash",
      rol: user.rol,
      estado: user.estado,
      sedeId: 1,
      areaId: 2,
      turnoId: 3,
    });
  });

  it("reports whether codigo or email is already in use", async () => {
    users.findCollision.mockResolvedValue({
      id: 11,
      codigo: "OTHER",
      email: user.email,
    });

    await expect(
      service.crear({
        codigo: user.codigo,
        email: user.email,
        password: "A-secure-password-123!",
        rol: user.rol,
        estado: user.estado,
        sedeId: null,
        areaId: null,
        turnoId: null,
      }),
    ).rejects.toMatchObject({ code: "USER_EMAIL_ALREADY_EXISTS" });
  });

  it("rejects assignments that do not form one hierarchy", async () => {
    areas.findById.mockResolvedValue({ ...area, sedeId: 99 });

    await expect(
      service.crear({
        codigo: user.codigo,
        email: user.email,
        password: "A-secure-password-123!",
        rol: user.rol,
        estado: user.estado,
        sedeId: 1,
        areaId: 2,
        turnoId: 3,
      }),
    ).rejects.toMatchObject({ code: "USER_AREA_NOT_IN_SEDE" });
    expect(users.create).not.toHaveBeenCalled();
  });

  it("merges omitted assignments and hashes a replacement password", async () => {
    await service.actualizar(user.id, {
      email: "changed@ares.local",
      password: "Another-secure-password!",
    });

    expect(users.findCollision).toHaveBeenCalledWith({
      codigo: undefined,
      email: "changed@ares.local",
      excludeId: user.id,
    });
    expect(users.update).toHaveBeenCalledWith(user.id, {
      email: "changed@ares.local",
      passwordHash: "password-hash",
    });
  });

  it("performs an idempotent logical delete", async () => {
    await service.darDeBaja(user.id);
    expect(users.update).toHaveBeenCalledWith(user.id, {
      estado: EstadoUsuario.BAJA,
    });

    users.findById.mockResolvedValue({ ...user, estado: EstadoUsuario.BAJA });
    users.update.mockClear();
    await expect(service.darDeBaja(user.id)).resolves.toMatchObject({
      estado: EstadoUsuario.BAJA,
    });
    expect(users.update).not.toHaveBeenCalled();
  });
});
