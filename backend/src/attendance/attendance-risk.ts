import { z } from "zod";

export const ATTENDANCE_TIME_ZONE = "America/Mexico_City";
export const riskRulesSchema = z
  .strictObject({
    redBelowSeconds: z.number().int().min(1).max(600).default(300),
    greenFromSeconds: z.number().int().min(600).max(3600).default(1800),
    greenUntilSeconds: z.number().int().min(3600).max(36000).default(28800),
    redAboveSeconds: z.number().int().min(3600).max(43200).default(36000),
  })
  .refine(
    (r) =>
      r.redBelowSeconds < r.greenFromSeconds &&
      r.greenFromSeconds < r.greenUntilSeconds &&
      r.greenUntilSeconds < r.redAboveSeconds,
    "Risk thresholds must be strictly ordered",
  );
export type RiskRules = z.infer<typeof riskRulesSchema>;
export const DEFAULT_RISK_RULES = riskRulesSchema.parse({});
export type Risk = {
  color: "VERDE" | "AMARILLO" | "ROJO";
  reasons: string[];
  policyVersion: number;
};
export type ShiftSnapshot = {
  start: string;
  end: string;
  days: string[];
  exceptionId?: string;
  exceptionEffect?: string;
};
const days = [
  "DOMINGO",
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
];

export function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATTENDANCE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    weekDay:
      days[new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`).getUTCDay()],
  };
}

/** Resolve wall-clock cutoff through Intl, rather than relying on the host timezone. */
export function dailyCutoff(start: Date): Date {
  const wall = Date.parse(`${localParts(start).day}T23:59:00Z`);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const local = localParts(new Date(guess));
    guess += wall - Date.parse(`${local.day}T${local.time}Z`);
  }
  return new Date(guess);
}

export function evaluateRisk(input: {
  start: Date;
  end: Date;
  omitted?: boolean;
  corrected?: boolean;
  overlap?: boolean;
  shift?: ShiftSnapshot | null;
  rules?: RiskRules;
  policyVersion?: number;
}): Risk {
  const rules = input.rules ?? DEFAULT_RISK_RULES;
  const seconds = Math.floor(
    (input.end.getTime() - input.start.getTime()) / 1000,
  );
  const red: string[] = [],
    yellow: string[] = [];
  if (
    seconds < 0 ||
    !Number.isFinite(seconds) ||
    localParts(input.start).day !== localParts(input.end).day
  )
    red.push("INTERVALO_INCONSISTENTE");
  else if (seconds < rules.redBelowSeconds) red.push("DURACION_BAJO_MINIMO");
  else if (seconds < rules.greenFromSeconds) yellow.push("DURACION_CORTA");
  else if (seconds > rules.redAboveSeconds) red.push("DURACION_EXCESIVA");
  else if (seconds > rules.greenUntilSeconds) yellow.push("DURACION_EXTENDIDA");
  if (input.omitted) red.push("CHECKOUT_OMITIDO");
  if (input.overlap) red.push("SOLAPAMIENTO");
  if (input.corrected) yellow.push("SESION_CORREGIDA");
  if (!input.shift) yellow.push("TURNO_NO_VERIFICADO");
  else {
    if (
      ["SUSPENSION_ACTIVIDADES", "PERMISO_PROGRAMADO"].includes(
        input.shift.exceptionEffect ?? "",
      )
    )
      yellow.push("DIA_NO_LABORABLE");
    const start = localParts(input.start),
      end = localParts(input.end);
    if (
      !input.shift.days.includes(start.weekDay) ||
      start.time < input.shift.start ||
      end.time > input.shift.end
    )
      yellow.push("FUERA_DE_TURNO");
  }
  return {
    color: red.length ? "ROJO" : yellow.length ? "AMARILLO" : "VERDE",
    reasons: [...red, ...yellow],
    policyVersion: input.policyVersion ?? 0,
  };
}
