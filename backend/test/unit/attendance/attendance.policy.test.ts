import { describe, expect, it } from "vitest";

import type { AuthUser } from "../../../src/auth/auth-user";
import { EstadoUsuario, RolUsuario } from "../../../src/generated/prisma/enums";
import { AttendancePolicy } from "../../../src/attendance/attendance.policy";

const policy = new AttendancePolicy();

describe("AttendancePolicy", () => {
  it("gives ADMIN and jefe de coordinadores global scope", () => {
    expect(policy.scope(user(RolUsuario.ADMIN))).toEqual({});
    expect(policy.scope(user(RolUsuario.JEFE_COORDINADORES))).toEqual({});
  });

  it("scopes jefe de sede to its sede and rejects missing assignment", () => {
    expect(policy.scope(user(RolUsuario.JEFE_SEDE, { sedeId: 7 }))).toEqual({
      sedeId: 7,
    });
    expect(() => policy.scope(user(RolUsuario.JEFE_SEDE))).toThrowError(
      expect.objectContaining({ response: { error: "FORBIDDEN" } }),
    );
  });

  it("scopes jefe de area and coordinador to their area and fails closed", () => {
    expect(policy.scope(user(RolUsuario.JEFE_AREA, { areaId: 4 }))).toEqual({
      areaId: 4,
    });
    expect(policy.scope(user(RolUsuario.COORDINADOR, { areaId: 4 }))).toEqual({
      areaId: 4,
    });
    expect(() => policy.scope(user(RolUsuario.JEFE_AREA))).toThrow();
    expect(() => policy.scope(user(RolUsuario.COORDINADOR))).toThrow();
  });

  it("denies prestadores and enforces sede or area assignments", () => {
    expect(() => policy.scope(user(RolUsuario.PRESTADOR))).toThrow();
    const sede = user(RolUsuario.JEFE_SEDE, { sedeId: 2 });
    expect(() =>
      policy.requireManage(sede, { sedeId: 2, areaId: 9 }),
    ).not.toThrow();
    expect(() =>
      policy.requireManage(sede, { sedeId: 3, areaId: 9 }),
    ).toThrow();
    const area = user(RolUsuario.COORDINADOR, { areaId: 5 });
    expect(() =>
      policy.requireManage(area, { sedeId: 2, areaId: 5 }),
    ).not.toThrow();
    expect(() =>
      policy.requireManage(area, { sedeId: 2, areaId: 6 }),
    ).toThrow();
  });
});

function user(rol: RolUsuario, overrides: Partial<AuthUser> = {}): AuthUser {
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
