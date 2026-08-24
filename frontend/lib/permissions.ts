import type { AuthUser, UserRole } from "./types";

export const roleLabels: Record<UserRole, string> = {
  PRESTADOR: "Prestador",
  COORDINADOR: "Coordinador",
  JEFE_AREA: "Jefe de área",
  JEFE_SEDE: "Jefe de sede",
  JEFE_COORDINADORES: "Jefe de coordinadores",
  ADMIN: "Administrador",
};

export const roleRank: Record<UserRole, number> = {
  PRESTADOR: 0,
  COORDINADOR: 1,
  JEFE_AREA: 2,
  JEFE_SEDE: 3,
  JEFE_COORDINADORES: 4,
  ADMIN: 5,
};

export function canReadUsers(user: AuthUser) {
  return user.rol !== "PRESTADOR";
}

export function canManageOrganization(user: AuthUser) {
  return user.rol === "JEFE_SEDE" || user.rol === "ADMIN";
}

export function canCreateSede(user: AuthUser) {
  return user.rol === "ADMIN";
}

export function canManageSede(user: AuthUser, sedeId: number) {
  return (
    user.rol === "ADMIN" || (user.rol === "JEFE_SEDE" && user.sedeId === sedeId)
  );
}

export function manageableRoles(user: AuthUser) {
  return (Object.keys(roleRank) as UserRole[]).filter(
    (role) => roleRank[role] <= roleRank[user.rol],
  );
}
