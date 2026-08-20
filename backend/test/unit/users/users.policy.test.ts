import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthUser } from "../../../src/auth/auth-user";
import { EstadoUsuario, RolUsuario } from "../../../src/generated/prisma/enums";
import { UsersPolicy } from "../../../src/users/users.policy";
import type { UsersRepository } from "../../../src/users/users.repository";

const users = { findById: vi.fn() };
const policy = new UsersPolicy(users as unknown as UsersRepository);
const now = new Date("2026-08-20T00:00:00.000Z");
const target = {
  id: 20,
  codigo: "USER020",
  email: "user20@ares.local",
  rol: RolUsuario.PRESTADOR,
  estado: EstadoUsuario.ACTIVO,
  sedeId: 1,
  areaId: 2,
  turnoId: 3,
  createdAt: now,
  updatedAt: now,
};

describe("UsersPolicy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    users.findById.mockResolvedValue(target);
  });

  it("translates RBAC grants into database list scopes", () => {
    expect(policy.listScope(createUser(RolUsuario.ADMIN))).toEqual({
      type: "global",
    });
    expect(
      policy.listScope(createUser(RolUsuario.JEFE_SEDE, { sedeId: 1 })),
    ).toEqual({ type: "sede", sedeId: 1 });
    expect(
      policy.listScope(createUser(RolUsuario.COORDINADOR, { areaId: 2 })),
    ).toEqual({ type: "area", areaId: 2 });
  });

  it("restricts creation to the actor's data scope", () => {
    const actor = createUser(RolUsuario.COORDINADOR, { areaId: 2 });
    expect(() => policy.requireCreation(actor, target)).not.toThrow();
    expect(() =>
      policy.requireCreation(actor, { ...target, areaId: 99 }),
    ).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it("prevents assigning a role above the actor", () => {
    const actor = createUser(RolUsuario.JEFE_AREA, { areaId: 2 });
    expect(() =>
      policy.requireCreation(actor, {
        ...target,
        rol: RolUsuario.JEFE_SEDE,
      }),
    ).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it("checks both the current and destination scope during updates", async () => {
    const actor = createUser(RolUsuario.JEFE_SEDE, { sedeId: 1 });
    await expect(
      policy.requireUpdate(actor, target.id, { sedeId: 2 }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("does not allow a user to delete their own account", async () => {
    const actor = createUser(RolUsuario.ADMIN, { id: target.id });
    await expect(
      policy.requireDeletion(actor, target.id),
    ).rejects.toMatchObject({ status: 409 });
  });
});

function createUser(
  rol: RolUsuario,
  overrides: Partial<AuthUser> = {},
): AuthUser {
  return {
    id: 1,
    codigo: "ACTOR001",
    email: "actor@ares.local",
    rol,
    estado: EstadoUsuario.ACTIVO,
    sedeId: null,
    areaId: null,
    turnoId: null,
    ...overrides,
  };
}
