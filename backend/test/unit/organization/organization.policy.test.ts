import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthUser } from "../../../src/auth/auth-user";
import { EstadoUsuario, RolUsuario } from "../../../src/generated/prisma/enums";
import { OrganizationPolicy } from "../../../src/organization/organization.policy";
import type { AreaRepository } from "../../../src/organization/repositories/area.repository";
import type { TurnoRepository } from "../../../src/organization/repositories/turno.repository";

const areas = { findById: vi.fn() };
const turnos = { findById: vi.fn() };
const policy = new OrganizationPolicy(
  areas as unknown as AreaRepository,
  turnos as unknown as TurnoRepository,
);

describe("OrganizationPolicy", () => {
  beforeEach(() => vi.resetAllMocks());

  it("allows only a global manager to create sedes", () => {
    expect(() =>
      policy.requireSedeCreation(createUser(RolUsuario.ADMIN)),
    ).not.toThrow();
    expect(() =>
      policy.requireSedeCreation(
        createUser(RolUsuario.JEFE_SEDE, { sedeId: 1 }),
      ),
    ).toThrowError(
      expect.objectContaining({ response: { error: "FORBIDDEN" } }),
    );
  });

  it("restricts a jefe de sede to its own sede", () => {
    const manager = createUser(RolUsuario.JEFE_SEDE, { sedeId: 1 });
    expect(() => policy.requireSedeManagement(manager, 1)).not.toThrow();
    expect(() => policy.requireSedeManagement(manager, 2)).toThrowError(
      expect.objectContaining({ response: { error: "FORBIDDEN" } }),
    );
  });

  it("prevents moving an area outside the manager's sede", async () => {
    const manager = createUser(RolUsuario.JEFE_SEDE, { sedeId: 1 });
    areas.findById.mockResolvedValue({ id: 4, sedeId: 1 });

    await expect(
      policy.requireAreaManagement(manager, 4, 2),
    ).rejects.toMatchObject({
      response: { error: "FORBIDDEN" },
    });
  });

  it("checks both the turno's current area and its destination", async () => {
    const manager = createUser(RolUsuario.JEFE_SEDE, { sedeId: 1 });
    turnos.findById.mockResolvedValue({ id: 8, areaId: 4 });
    areas.findById
      .mockResolvedValueOnce({ id: 4, sedeId: 1 })
      .mockResolvedValueOnce({ id: 5, sedeId: 2 });

    await expect(
      policy.requireTurnoManagement(manager, 8, 5),
    ).rejects.toMatchObject({
      response: { error: "FORBIDDEN" },
    });
  });

  it("allows an admin to manage resources globally", async () => {
    const admin = createUser(RolUsuario.ADMIN);
    turnos.findById.mockResolvedValue({ id: 8, areaId: 4 });
    areas.findById.mockResolvedValue({ id: 4, sedeId: 99 });

    await expect(
      policy.requireTurnoManagement(admin, 8),
    ).resolves.toBeUndefined();
  });
});

function createUser(
  rol: RolUsuario,
  overrides: Partial<AuthUser> = {},
): AuthUser {
  return {
    id: 1,
    codigo: "USER001",
    email: "user@ares.local",
    rol,
    estado: EstadoUsuario.ACTIVO,
    sedeId: null,
    areaId: null,
    turnoId: null,
    ...overrides,
  };
}
