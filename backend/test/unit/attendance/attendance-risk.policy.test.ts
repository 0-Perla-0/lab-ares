import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import {
  AttendanceRiskPolicy,
  AttendanceRiskReason,
} from "../../../src/attendance/attendance-risk.policy";
import type { Turno, TurnoDia } from "../../../src/generated/prisma/client";
import {
  DiaSemana,
  NivelRiesgoAsistencia,
} from "../../../src/generated/prisma/enums";

const policy = new AttendanceRiskPolicy(
  new ConfigService({ APP_TIME_ZONE: "America/Mexico_City" }),
);
const turno: Turno & { dias: TurnoDia[] } = {
  id: 1,
  nombre: "Matutino",
  horaInicio: new Date("1970-01-01T08:00:00.000Z"),
  horaFin: new Date("1970-01-01T12:00:00.000Z"),
  activo: true,
  areaId: 1,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  dias: [{ turnoId: 1, dia: DiaSemana.LUNES }],
};

describe("AttendanceRiskPolicy", () => {
  it("keeps a scheduled check-in unevaluated until duration is known", () => {
    const result = policy.evaluateCheckIn(
      new Date("2026-08-24T15:00:00.000Z"),
      turno,
    );
    expect(result).toEqual({
      nivel: NivelRiesgoAsistencia.NO_EVALUADO,
      motivos: [],
    });
  });

  it("marks an out-of-shift or unverifiable check-in yellow", () => {
    expect(
      policy.evaluateCheckIn(new Date("2026-08-24T20:00:00.000Z"), turno),
    ).toEqual({
      nivel: NivelRiesgoAsistencia.AMARILLO,
      motivos: [AttendanceRiskReason.FUERA_DE_TURNO],
    });
    expect(policy.evaluateCheckIn(new Date(), null)).toEqual({
      nivel: NivelRiesgoAsistencia.AMARILLO,
      motivos: [AttendanceRiskReason.TURNO_NO_VERIFICADO],
    });
  });

  it.each([
    [4, NivelRiesgoAsistencia.ROJO, "DURACION_MENOR_5_MIN"],
    [5, NivelRiesgoAsistencia.AMARILLO, "DURACION_ENTRE_5_Y_29_MIN"],
    [29, NivelRiesgoAsistencia.AMARILLO, "DURACION_ENTRE_5_Y_29_MIN"],
    [30, NivelRiesgoAsistencia.VERDE, undefined],
    [480, NivelRiesgoAsistencia.VERDE, undefined],
    [481, NivelRiesgoAsistencia.AMARILLO, "DURACION_MAYOR_8_H"],
    [600, NivelRiesgoAsistencia.AMARILLO, "DURACION_MAYOR_8_H"],
    [601, NivelRiesgoAsistencia.ROJO, "DURACION_MAYOR_10_H"],
  ])("evaluates a %i-minute session", (minutes, nivel, reason) => {
    const start = new Date("2026-08-24T15:00:00.000Z");
    const end = new Date(start.getTime() + Number(minutes) * 60_000);
    const result = policy.evaluateCheckOut(start, end, []);

    expect(result.nivel).toBe(nivel);
    expect(result.duracionMinutos).toBe(minutes);
    if (reason) expect(result.motivos).toContain(reason);
    else expect(result.motivos).toEqual([]);
  });

  it("preserves the highest existing risk and its explainable reason", () => {
    const start = new Date("2026-08-24T15:00:00.000Z");
    const end = new Date(start.getTime() + 60 * 60_000);
    expect(
      policy.evaluateCheckOut(start, end, [
        AttendanceRiskReason.FUERA_DE_TURNO,
      ]),
    ).toMatchObject({
      nivel: NivelRiesgoAsistencia.AMARILLO,
      motivos: [AttendanceRiskReason.FUERA_DE_TURNO],
    });
  });
});
