import { describe, expect, it } from "vitest";

import { EstadoUsuario, RolUsuario } from "../../generated/prisma/enums";
import type { AuthUser } from "../auth/types";
import { can, Permission } from "./permissions";

function createUser(rol: RolUsuario): AuthUser {
  return {
    id: 1,
    codigo: "USER001",
    email: "user@ares.local",
    rol,
    estado: EstadoUsuario.ACTIVO,
    sedeId: null,
    areaId: null,
    turnoId: null,
  };
}

describe("can", () => {
  it.each(Object.values(Permission))("allows ADMIN to use %s", (permission) => {
    expect(can(createUser(RolUsuario.ADMIN), permission)).toBe(true);
  });

  it.each([
    RolUsuario.PRESTADOR,
    RolUsuario.COORDINADOR,
    RolUsuario.JEFE_COORDINADORES,
    RolUsuario.JEFE_AREA,
    RolUsuario.JEFE_SEDE,
  ])("denies all current permissions to %s", (rol) => {
    const user = createUser(rol);

    for (const permission of Object.values(Permission)) {
      expect(can(user, permission)).toBe(false);
    }
  });

  it("denies anonymous users", () => {
    expect(can(null, Permission.ORGANIZATION_READ)).toBe(false);
  });
});
