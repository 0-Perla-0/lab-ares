import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthService,
  InvalidCredentialsError,
} from "../../../src/auth/auth.service";
import { verifyPassword } from "../../../src/auth/password";
import type { UserRepository } from "../../../src/auth/user.repository";
import { EstadoUsuario, RolUsuario } from "../../../src/generated/prisma/enums";

vi.mock("../../../src/auth/password", () => ({ verifyPassword: vi.fn() }));

const findByEmailForAuth = vi.fn();
const repository = { findByEmailForAuth } as unknown as UserRepository;
const service = new AuthService(repository);
const mockedVerifyPassword = vi.mocked(verifyPassword);

const activeUser = {
  id: 1,
  codigo: "ADMIN001",
  email: "admin@ares.local",
  passwordHash: "stored-hash",
  rol: RolUsuario.ADMIN,
  estado: EstadoUsuario.ACTIVO,
  sedeId: null,
  areaId: null,
  turnoId: null,
};

describe("AuthService", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns an AuthUser without passwordHash", async () => {
    findByEmailForAuth.mockResolvedValue(activeUser);
    mockedVerifyPassword.mockResolvedValue(true);

    const user = await service.authenticate(activeUser.email, "Admin123!");

    expect(user).toEqual({
      id: activeUser.id,
      codigo: activeUser.codigo,
      email: activeUser.email,
      rol: activeUser.rol,
      estado: activeUser.estado,
      sedeId: null,
      areaId: null,
      turnoId: null,
    });
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("uses the same public error when the email does not exist", async () => {
    findByEmailForAuth.mockResolvedValue(null);
    await expect(
      service.authenticate("missing@ares.local", "Admin123!"),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(mockedVerifyPassword).toHaveBeenCalledOnce();
  });

  it("uses the same public error for an incorrect password", async () => {
    findByEmailForAuth.mockResolvedValue(activeUser);
    mockedVerifyPassword.mockResolvedValue(false);
    await expect(
      service.authenticate(activeUser.email, "incorrect"),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it.each([
    EstadoUsuario.PENDIENTE,
    EstadoUsuario.INACTIVO,
    EstadoUsuario.LIBERADO,
    EstadoUsuario.BAJA,
  ])("rejects a user in the %s state", async (estado) => {
    findByEmailForAuth.mockResolvedValue({ ...activeUser, estado });
    mockedVerifyPassword.mockResolvedValue(true);
    await expect(
      service.authenticate(activeUser.email, "Admin123!"),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
