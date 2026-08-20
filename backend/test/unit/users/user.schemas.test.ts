import { describe, expect, it } from "vitest";

import { EstadoUsuario, RolUsuario } from "../../../src/generated/prisma/enums";
import {
  actualizarUsuarioSchema,
  crearUsuarioSchema,
} from "../../../src/users/user.schemas";

describe("user schemas", () => {
  it("normalizes identity fields and supplies safe defaults", () => {
    expect(
      crearUsuarioSchema.parse({
        codigo: "  USER001  ",
        email: "  USER@ARES.LOCAL ",
        password: "A-secure-password-123!",
      }),
    ).toEqual({
      codigo: "USER001",
      email: "user@ares.local",
      password: "A-secure-password-123!",
      rol: RolUsuario.PRESTADOR,
      estado: EstadoUsuario.PENDIENTE,
      sedeId: null,
      areaId: null,
      turnoId: null,
    });
  });

  it("rejects weak passwords and bcrypt-truncated passwords", () => {
    const base = { codigo: "USER001", email: "user@ares.local" };
    expect(
      crearUsuarioSchema.safeParse({ ...base, password: "short" }).success,
    ).toBe(false);
    expect(
      crearUsuarioSchema.safeParse({ ...base, password: "á".repeat(37) })
        .success,
    ).toBe(false);
  });

  it("does not create users already in BAJA", () => {
    expect(
      crearUsuarioSchema.safeParse({
        codigo: "USER001",
        email: "user@ares.local",
        password: "A-secure-password-123!",
        estado: EstadoUsuario.BAJA,
      }).success,
    ).toBe(false);
  });

  it("accepts nullable assignments and rejects empty updates", () => {
    expect(
      actualizarUsuarioSchema.parse({ sedeId: null, areaId: null }),
    ).toEqual({ sedeId: null, areaId: null });
    expect(actualizarUsuarioSchema.safeParse({}).success).toBe(false);
  });
});
