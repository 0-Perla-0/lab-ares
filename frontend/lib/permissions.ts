import type { AuthUser, UserRole } from "./types";

export const permissions = {
  ACADEMIC_PROFILE_READ: "academic:profile:read",
  ACADEMIC_PROFILE_UPDATE: "academic:profile:update",
  ACADEMIC_CATALOG_MANAGE: "academic:catalog:manage",
  DOCUMENTS_READ: "documents:read",
  DOCUMENTS_UPLOAD: "documents:upload",
  DOCUMENTS_REVIEW: "documents:review",
  DIRECTORY_READ: "directory:read",
  KAIROS_PROJECT_CREATE: "kairos:project:create",
  REPORTS_READ: "reports:read",
  REPORTS_EXPORT: "reports:export",
  LIBRARY_READ: "library:read",
  LIBRARY_DRAFT_CREATE: "library:draft:create",
  LIBRARY_REVIEW: "library:review",
  LIBRARY_PUBLISH: "library:publish",
  LIBRARY_ARCHIVE: "library:archive",
  LIBRARY_ACKNOWLEDGE: "library:acknowledge",
  CMS_DRAFT: "public-content:draft",
  CMS_PUBLISH: "public-content:publish",
  CMS_ARCHIVE: "public-content:archive",
  GAMIFICATION_READ: "gamification:read",
  GAMIFICATION_MANAGE: "gamification:manage",
  PRINTING_3D_REQUEST: "printing-3d:request",
  PRINTING_3D_OPERATE: "printing-3d:operate",
  PRINTING_3D_MANAGE: "printing-3d:manage",
  RETENTION_REQUEST: "retention:request",
  RETENTION_READ: "retention:read",
  RETENTION_MANAGE: "retention:manage",
  RETENTION_EXECUTE: "retention:execute",
} as const;

export type Permission = (typeof permissions)[keyof typeof permissions];
export type AccessScope = "self" | "area" | "sede" | "global";

type ExplicitGrantMap = Readonly<Partial<Record<Permission, AccessScope>>>;
type UserWithExplicitGrants = AuthUser & {
  permissionScopes?: ExplicitGrantMap;
};

const accessScopes = new Set<AccessScope>(["self", "area", "sede", "global"]);

const scopeRank: Record<AccessScope, number> = {
  self: 0,
  area: 1,
  sede: 2,
  global: 3,
};

/**
 * Reads authorization grants returned by the backend. Missing grants are denied
 * deliberately: route visibility is convenience only and API authorization
 * remains the source of truth.
 */
export function permissionScope(
  user: AuthUser | null | undefined,
  permission: Permission,
): AccessScope | null {
  if (!user) return null;
  const explicit = user as UserWithExplicitGrants;
  const mapped = explicit.permissionScopes?.[permission];
  if (mapped && accessScopes.has(mapped)) return mapped;

  const granted = explicit.permissions?.[permission];
  return granted && accessScopes.has(granted) ? granted : null;
}

export function hasPermission(
  user: AuthUser | null | undefined,
  permission: Permission,
  minimumScope: AccessScope = "self",
) {
  const granted = permissionScope(user, permission);
  return granted !== null && scopeRank[granted] >= scopeRank[minimumScope];
}

export function hasAnyPermission(
  user: AuthUser | null | undefined,
  required: readonly Permission[],
) {
  return required.some((permission) => hasPermission(user, permission));
}

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
