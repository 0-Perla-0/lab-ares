import { beforeEach, describe, expect, it, vi } from "vitest";

import { EstadoUsuario, RolUsuario } from "../../generated/prisma/enums";
import { findByEmailForAuth } from "../repositories/user.repository";
import { authenticate, InvalidCredentialsError } from "./auth.service";
import { verifyPassword } from "./password";

vi.mock("../repositories/user.repository", () => ({
  findByEmailForAuth: vi.fn(),
}));

vi.mock("./password", () => ({
  verifyPassword: vi.fn(),
}));

const mockedFindByEmailForAuth = vi.mocked(findByEmailForAuth);
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

describe("authenticate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns an AuthUser without passwordHash", async () => {
    mockedFindByEmailForAuth.mockResolvedValue(activeUser);
    mockedVerifyPassword.mockResolvedValue(true);

    const user = await authenticate(activeUser.email, "Admin123!");

    expect(user).toEqual({
      id: activeUser.id,
      codigo: activeUser.codigo,
      email: activeUser.email,
      rol: activeUser.rol,
      estado: activeUser.estado,
      sedeId: activeUser.sedeId,
      areaId: activeUser.areaId,
      turnoId: activeUser.turnoId,
    });
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("uses the same public error when the email does not exist", async () => {
    mockedFindByEmailForAuth.mockResolvedValue(null);

    await expect(
      authenticate("missing@ares.local", "Admin123!"),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("uses the same public error for an incorrect password", async () => {
    mockedFindByEmailForAuth.mockResolvedValue(activeUser);
    mockedVerifyPassword.mockResolvedValue(false);

    await expect(
      authenticate(activeUser.email, "incorrect"),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it.each([
    EstadoUsuario.PENDIENTE,
    EstadoUsuario.INACTIVO,
    EstadoUsuario.LIBERADO,
    EstadoUsuario.BAJA,
  ])("rejects a user in the %s state", async (estado) => {
    mockedFindByEmailForAuth.mockResolvedValue({ ...activeUser, estado });
    mockedVerifyPassword.mockResolvedValue(true);

    await expect(
      authenticate(activeUser.email, "Admin123!"),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
