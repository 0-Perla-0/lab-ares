export const userRoles = [
  "PRESTADOR",
  "COORDINADOR",
  "JEFE_AREA",
  "JEFE_SEDE",
  "JEFE_COORDINADORES",
  "ADMIN",
] as const;

export const userStates = [
  "ACTIVO",
  "PENDIENTE",
  "INACTIVO",
  "LIBERADO",
  "BAJA",
] as const;

export const weekDays = [
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
  "DOMINGO",
] as const;

export type UserRole = (typeof userRoles)[number];
export type UserState = (typeof userStates)[number];
export type WeekDay = (typeof weekDays)[number];

export type AuthUser = {
  id: number;
  codigo: string;
  email: string;
  rol: UserRole;
  estado: UserState;
  sedeId: number | null;
  areaId: number | null;
  turnoId: number | null;
};

export type PublicUser = AuthUser & {
  createdAt: string;
  updatedAt: string;
};

export type Sede = {
  id: number;
  nombre: string;
  direccion: string | null;
  activa: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Area = {
  id: number;
  nombre: string;
  activa: boolean;
  sedeId: number;
  createdAt: string;
  updatedAt: string;
};

export type Turno = {
  id: number;
  nombre: string;
  horaInicio: string;
  horaFin: string;
  activo: boolean;
  areaId: number;
  dias: WeekDay[];
  createdAt: string;
  updatedAt: string;
};

export type ApiEnvelope<T> = { data: T };
