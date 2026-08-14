import { describe, expect, it } from "vitest";

import { DiaSemana } from "../generated/prisma/enums";
import {
  actualizarAreaSchema,
  actualizarSedeSchema,
  actualizarTurnoSchema,
  crearAreaSchema,
  crearSedeSchema,
  crearTurnoSchema,
  idParamSchema,
} from "./organization.schemas";

describe("organization schemas", () => {
  it("normalizes sede text fields", () => {
    expect(
      crearSedeSchema.parse({ nombre: "  Centro  ", direccion: "  " }),
    ).toEqual({ nombre: "Centro", direccion: null });
  });

  it("rejects empty partial updates", () => {
    expect(actualizarSedeSchema.safeParse({}).success).toBe(false);
    expect(actualizarAreaSchema.safeParse({}).success).toBe(false);
    expect(actualizarTurnoSchema.safeParse({}).success).toBe(false);
  });

  it("requires a positive sede reference for areas", () => {
    expect(crearAreaSchema.safeParse({ nombre: "A", sedeId: 0 }).success).toBe(
      false,
    );
  });

  it("normalizes schedule times to minutes", () => {
    expect(
      crearTurnoSchema.parse({
        nombre: "Matutino",
        areaId: 1,
        horaInicio: "08:15",
        horaFin: "12:30",
        dias: [DiaSemana.LUNES],
      }),
    ).toMatchObject({ horaInicio: 495, horaFin: 750 });
  });

  it("rejects inverted schedules, duplicate days and unknown days", () => {
    const base = {
      nombre: "Matutino",
      areaId: 1,
      horaInicio: "12:00",
      horaFin: "08:00",
    };
    expect(
      crearTurnoSchema.safeParse({ ...base, dias: [DiaSemana.LUNES] }).success,
    ).toBe(false);
    expect(
      crearTurnoSchema.safeParse({
        ...base,
        horaInicio: "08:00",
        horaFin: "12:00",
        dias: [DiaSemana.LUNES, DiaSemana.LUNES],
      }).success,
    ).toBe(false);
    expect(
      crearTurnoSchema.safeParse({
        ...base,
        horaInicio: "08:00",
        horaFin: "12:00",
        dias: ["FERIADO"],
      }).success,
    ).toBe(false);
  });

  it("parses only positive integer route identifiers", () => {
    expect(idParamSchema.parse("42")).toBe(42);
    for (const invalid of ["0", "-1", "1.5", "abc"]) {
      expect(idParamSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
