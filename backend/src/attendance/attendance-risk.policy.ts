import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Turno, TurnoDia } from "../generated/prisma/client";
import { DiaSemana, NivelRiesgoAsistencia } from "../generated/prisma/enums";

export const ATTENDANCE_RISK_POLICY_VERSION = "attendance-risk-2026-08-25-v1";

export const AttendanceRiskReason = {
  TURNO_NO_VERIFICADO: "TURNO_NO_VERIFICADO",
  FUERA_DE_TURNO: "FUERA_DE_TURNO",
  DURACION_MENOR_5_MIN: "DURACION_MENOR_5_MIN",
  DURACION_ENTRE_5_Y_29_MIN: "DURACION_ENTRE_5_Y_29_MIN",
  DURACION_MAYOR_8_H: "DURACION_MAYOR_8_H",
  DURACION_MAYOR_10_H: "DURACION_MAYOR_10_H",
} as const;

type Shift = Turno & { dias: TurnoDia[] };
type RiskEvaluation = {
  nivel: NivelRiesgoAsistencia;
  motivos: string[];
};

const riskRank: Record<NivelRiesgoAsistencia, number> = {
  [NivelRiesgoAsistencia.NO_EVALUADO]: 0,
  [NivelRiesgoAsistencia.VERDE]: 1,
  [NivelRiesgoAsistencia.AMARILLO]: 2,
  [NivelRiesgoAsistencia.ROJO]: 3,
};

@Injectable()
export class AttendanceRiskPolicy {
  private readonly timeZone: string;

  constructor(config: ConfigService) {
    this.timeZone =
      config.get<string>("APP_TIME_ZONE") ?? "America/Mexico_City";
  }

  evaluateCheckIn(checkInAt: Date, turno: Shift | null): RiskEvaluation {
    if (!turno || !turno.activo) {
      return {
        nivel: NivelRiesgoAsistencia.AMARILLO,
        motivos: [AttendanceRiskReason.TURNO_NO_VERIFICADO],
      };
    }

    if (!this.isWithinShift(checkInAt, turno)) {
      return {
        nivel: NivelRiesgoAsistencia.AMARILLO,
        motivos: [AttendanceRiskReason.FUERA_DE_TURNO],
      };
    }

    return { nivel: NivelRiesgoAsistencia.NO_EVALUADO, motivos: [] };
  }

  evaluateCheckOut(
    checkInAt: Date,
    checkOutAt: Date,
    existingReasons: string[],
  ): RiskEvaluation & { duracionMinutos: number } {
    const duracionMinutos = Math.max(
      0,
      Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60_000),
    );
    const motivos = [...existingReasons];
    let nivel: NivelRiesgoAsistencia = motivos.length
      ? NivelRiesgoAsistencia.AMARILLO
      : NivelRiesgoAsistencia.VERDE;

    if (duracionMinutos < 5) {
      motivos.push(AttendanceRiskReason.DURACION_MENOR_5_MIN);
      nivel = maxRisk(nivel, NivelRiesgoAsistencia.ROJO);
    } else if (duracionMinutos < 30) {
      motivos.push(AttendanceRiskReason.DURACION_ENTRE_5_Y_29_MIN);
      nivel = maxRisk(nivel, NivelRiesgoAsistencia.AMARILLO);
    } else if (duracionMinutos > 600) {
      motivos.push(AttendanceRiskReason.DURACION_MAYOR_10_H);
      nivel = maxRisk(nivel, NivelRiesgoAsistencia.ROJO);
    } else if (duracionMinutos > 480) {
      motivos.push(AttendanceRiskReason.DURACION_MAYOR_8_H);
      nivel = maxRisk(nivel, NivelRiesgoAsistencia.AMARILLO);
    }

    return { nivel, motivos: [...new Set(motivos)], duracionMinutos };
  }

  private isWithinShift(at: Date, turno: Shift): boolean {
    const local = localDateParts(at, this.timeZone);
    const scheduledDays = new Set(turno.dias.map(({ dia }) => dia));

    return (
      scheduledDays.has(local.day) &&
      local.minute >= toMinuteOfDay(turno.horaInicio) &&
      local.minute <= toMinuteOfDay(turno.horaFin)
    );
  }
}

function maxRisk(
  left: NivelRiesgoAsistencia,
  right: NivelRiesgoAsistencia,
): NivelRiesgoAsistencia {
  return riskRank[left] >= riskRank[right] ? left : right;
}

function toMinuteOfDay(time: Date): number {
  return time.getUTCHours() * 60 + time.getUTCMinutes();
}

function localDateParts(
  at: Date,
  timeZone: string,
): {
  day: DiaSemana;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  const dayByName: Record<string, DiaSemana> = {
    Mon: DiaSemana.LUNES,
    Tue: DiaSemana.MARTES,
    Wed: DiaSemana.MIERCOLES,
    Thu: DiaSemana.JUEVES,
    Fri: DiaSemana.VIERNES,
    Sat: DiaSemana.SABADO,
    Sun: DiaSemana.DOMINGO,
  };
  const day = dayByName[values.weekday];

  if (!day || values.hour === undefined || values.minute === undefined) {
    throw new Error("ATTENDANCE_TIME_ZONE_CONVERSION_FAILED");
  }

  return {
    day,
    minute: Number(values.hour) * 60 + Number(values.minute),
  };
}
