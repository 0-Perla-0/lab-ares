import type { UserState, WeekDay } from "./types";

export const stateLabels: Record<UserState, string> = {
  INVITADA: "Invitada",
  ACTIVA: "Activa",
  SUSPENDIDA: "Suspendida",
  DESACTIVADA: "Desactivada",
  BLOQUEADA: "Bloqueada",
};

export const dayLabels: Record<WeekDay, string> = {
  LUNES: "Lun",
  MARTES: "Mar",
  MIERCOLES: "Mié",
  JUEVES: "Jue",
  VIERNES: "Vie",
  SABADO: "Sáb",
  DOMINGO: "Dom",
};

export function initials(value: string) {
  return value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
