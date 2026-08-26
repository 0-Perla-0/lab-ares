import { describe, expect, it } from "vitest";

import type { AuthUser } from "../../../src/auth/auth-user";
import {
  AccessScope,
  can,
  canAccessArea,
  canAccessSede,
  getAccessScope,
  Permission,
} from "../../../src/auth/permissions";
import { EstadoUsuario, RolUsuario } from "../../../src/generated/prisma/enums";

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

  it.each(Object.values(RolUsuario))(
    "allows %s to read its own attendance and check in",
    (rol) => {
      const user = createUser(rol);
      expect(can(user, Permission.ATTENDANCE_READ)).toBe(true);
      expect(can(user, Permission.ATTENDANCE_CHECK_IN)).toBe(true);
      expect(can(user, Permission.ATTENDANCE_CHECK_OUT)).toBe(true);
    },
  );

  it("matches the documented user-management hierarchy", () => {
    expect(can(createUser(RolUsuario.PRESTADOR), Permission.USERS_MANAGE)).toBe(
      false,
    );
    expect(
      can(createUser(RolUsuario.COORDINADOR), Permission.USERS_MANAGE),
    ).toBe(true);
    expect(
      getAccessScope(createUser(RolUsuario.JEFE_SEDE), Permission.USERS_MANAGE),
    ).toBe(AccessScope.SEDE);
    expect(
      getAccessScope(
        createUser(RolUsuario.JEFE_COORDINADORES),
        Permission.USERS_MANAGE,
      ),
    ).toBe(AccessScope.GLOBAL);
  });

  it("limits hour validation to area and higher leadership roles", () => {
    expect(
      can(createUser(RolUsuario.COORDINADOR), Permission.HOURS_VALIDATE),
    ).toBe(false);
    expect(
      can(createUser(RolUsuario.JEFE_AREA), Permission.HOURS_VALIDATE),
    ).toBe(true);
    expect(
      can(createUser(RolUsuario.JEFE_SEDE), Permission.HOURS_VALIDATE),
    ).toBe(true);
  });

  it("separates attendance correction from final validation", () => {
    expect(
      getAccessScope(
        createUser(RolUsuario.COORDINADOR),
        Permission.ATTENDANCE_CORRECT,
      ),
    ).toBe(AccessScope.AREA);
    expect(
      can(createUser(RolUsuario.COORDINADOR), Permission.HOURS_VALIDATE),
    ).toBe(false);
    expect(
      getAccessScope(
        createUser(RolUsuario.JEFE_SEDE),
        Permission.ATTENDANCE_CORRECT,
      ),
    ).toBe(AccessScope.SEDE);
  });

  it("allows only jefe de sede and admin to manage organization", () => {
    expect(
      can(createUser(RolUsuario.JEFE_AREA), Permission.ORGANIZATION_MANAGE),
    ).toBe(false);
    expect(
      can(createUser(RolUsuario.JEFE_SEDE), Permission.ORGANIZATION_MANAGE),
    ).toBe(true);
    expect(
      can(createUser(RolUsuario.ADMIN), Permission.ORGANIZATION_MANAGE),
    ).toBe(true);
  });

  it("denies anonymous users", () => {
    expect(can(null, Permission.ORGANIZATION_READ)).toBe(false);
  });
});

describe("scoped access", () => {
  it("restricts a jefe de sede to its own sede", () => {
    const user = { ...createUser(RolUsuario.JEFE_SEDE), sedeId: 7 };
    expect(canAccessSede(user, Permission.ORGANIZATION_MANAGE, 7)).toBe(true);
    expect(canAccessSede(user, Permission.ORGANIZATION_MANAGE, 8)).toBe(false);
  });

  it("restricts area-scoped roles to their own area", () => {
    const user = { ...createUser(RolUsuario.COORDINADOR), areaId: 4 };
    expect(
      canAccessArea(user, Permission.USERS_MANAGE, { id: 4, sedeId: 1 }),
    ).toBe(true);
    expect(
      canAccessArea(user, Permission.USERS_MANAGE, { id: 5, sedeId: 1 }),
    ).toBe(false);
  });

  it("allows global grants to access every scope", () => {
    const admin = createUser(RolUsuario.ADMIN);
    expect(canAccessSede(admin, Permission.ORGANIZATION_MANAGE, 99)).toBe(true);
    expect(
      canAccessArea(admin, Permission.USERS_MANAGE, { id: 8, sedeId: 9 }),
    ).toBe(true);
  });
});
