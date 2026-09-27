import { RolUsuario } from "../generated/prisma/enums";
import type { AuthUser } from "./auth-user";

export enum Permission {
  ATTENDANCE_SELF_READ = "attendance:self:read",
  ATTENDANCE_CHECK_IN = "attendance:check-in",
  ATTENDANCE_MANAGE = "attendance:manage",
  HOURS_VALIDATE = "hours:validate",
  ORGANIZATION_READ = "organization:read",
  ORGANIZATION_MANAGE = "organization:manage",
  USERS_READ = "users:read",
  USERS_MANAGE = "users:manage",
  DIRECTORY_READ = "directory:read",
  KAIROS_PROJECT_CREATE = "kairos:project:create",
  ACADEMIC_PROFILE_READ = "academic:profile:read",
  ACADEMIC_PROFILE_UPDATE = "academic:profile:update",
  ACADEMIC_CATALOG_MANAGE = "academic:catalog:manage",
  DOCUMENTS_READ = "documents:read",
  DOCUMENTS_UPLOAD = "documents:upload",
  DOCUMENTS_REVIEW = "documents:review",
  REPORTS_READ = "reports:read",
  REPORTS_EXPORT = "reports:export",
  LIBRARY_READ = "library:read",
  LIBRARY_DRAFT_CREATE = "library:draft:create",
  LIBRARY_REVIEW = "library:review",
  LIBRARY_PUBLISH = "library:publish",
  LIBRARY_ARCHIVE = "library:archive",
  LIBRARY_ACKNOWLEDGE = "library:acknowledge",
  PUBLIC_CONTENT_DRAFT = "public-content:draft",
  PUBLIC_CONTENT_PUBLISH = "public-content:publish",
  PUBLIC_CONTENT_ARCHIVE = "public-content:archive",
  GAMIFICATION_READ = "gamification:read",
  GAMIFICATION_MANAGE = "gamification:manage",
  PRINTING_3D_REQUEST = "printing-3d:request",
  PRINTING_3D_OPERATE = "printing-3d:operate",
  PRINTING_3D_MANAGE = "printing-3d:manage",
  RETENTION_REQUEST = "retention:request",
  RETENTION_READ = "retention:read",
  RETENTION_MANAGE = "retention:manage",
  RETENTION_EXECUTE = "retention:execute",
}

export enum AccessScope {
  SELF = "self",
  AREA = "area",
  SEDE = "sede",
  GLOBAL = "global",
}

type RoleGrants = Readonly<Partial<Record<Permission, AccessScope>>>;

const commonUserGrants: RoleGrants = {
  [Permission.ATTENDANCE_SELF_READ]: AccessScope.SELF,
  [Permission.ATTENDANCE_CHECK_IN]: AccessScope.SELF,
  [Permission.ACADEMIC_PROFILE_READ]: AccessScope.SELF,
  [Permission.ACADEMIC_PROFILE_UPDATE]: AccessScope.SELF,
  [Permission.DOCUMENTS_READ]: AccessScope.SELF,
  [Permission.DOCUMENTS_UPLOAD]: AccessScope.SELF,
  // Organization data is a shared catalogue needed by authenticated flows.
  [Permission.ORGANIZATION_READ]: AccessScope.GLOBAL,
  [Permission.DIRECTORY_READ]: AccessScope.GLOBAL,
  [Permission.LIBRARY_READ]: AccessScope.SELF,
  [Permission.LIBRARY_ACKNOWLEDGE]: AccessScope.SELF,
  [Permission.GAMIFICATION_READ]: AccessScope.SELF,
  [Permission.PRINTING_3D_REQUEST]: AccessScope.SELF,
  [Permission.RETENTION_REQUEST]: AccessScope.SELF,
};

const areaManagerGrants: RoleGrants = {
  ...commonUserGrants,
  [Permission.ATTENDANCE_MANAGE]: AccessScope.AREA,
  [Permission.USERS_READ]: AccessScope.AREA,
  [Permission.USERS_MANAGE]: AccessScope.AREA,
  [Permission.KAIROS_PROJECT_CREATE]: AccessScope.AREA,
  [Permission.ACADEMIC_PROFILE_READ]: AccessScope.AREA,
  [Permission.DOCUMENTS_READ]: AccessScope.AREA,
  [Permission.DOCUMENTS_REVIEW]: AccessScope.AREA,
  [Permission.REPORTS_READ]: AccessScope.AREA,
  [Permission.REPORTS_EXPORT]: AccessScope.AREA,
  [Permission.LIBRARY_READ]: AccessScope.AREA,
  [Permission.LIBRARY_DRAFT_CREATE]: AccessScope.AREA,
  [Permission.PUBLIC_CONTENT_DRAFT]: AccessScope.GLOBAL,
  [Permission.PRINTING_3D_OPERATE]: AccessScope.AREA,
  [Permission.PRINTING_3D_MANAGE]: AccessScope.AREA,
};

const permissionsByRole: Record<RolUsuario, RoleGrants> = {
  [RolUsuario.PRESTADOR]: commonUserGrants,
  [RolUsuario.COORDINADOR]: areaManagerGrants,
  [RolUsuario.JEFE_AREA]: {
    ...areaManagerGrants,
    [Permission.HOURS_VALIDATE]: AccessScope.AREA,
    [Permission.LIBRARY_REVIEW]: AccessScope.AREA,
    [Permission.LIBRARY_PUBLISH]: AccessScope.AREA,
    [Permission.LIBRARY_ARCHIVE]: AccessScope.AREA,
  },
  [RolUsuario.JEFE_SEDE]: {
    ...areaManagerGrants,
    [Permission.ATTENDANCE_MANAGE]: AccessScope.SEDE,
    [Permission.HOURS_VALIDATE]: AccessScope.SEDE,
    [Permission.ORGANIZATION_MANAGE]: AccessScope.SEDE,
    [Permission.USERS_READ]: AccessScope.SEDE,
    [Permission.USERS_MANAGE]: AccessScope.SEDE,
    [Permission.KAIROS_PROJECT_CREATE]: AccessScope.SEDE,
    [Permission.ACADEMIC_PROFILE_READ]: AccessScope.SEDE,
    [Permission.DOCUMENTS_READ]: AccessScope.SEDE,
    [Permission.DOCUMENTS_REVIEW]: AccessScope.SEDE,
    [Permission.REPORTS_READ]: AccessScope.SEDE,
    [Permission.REPORTS_EXPORT]: AccessScope.SEDE,
    [Permission.LIBRARY_READ]: AccessScope.SEDE,
    [Permission.LIBRARY_DRAFT_CREATE]: AccessScope.SEDE,
    [Permission.LIBRARY_REVIEW]: AccessScope.SEDE,
    [Permission.LIBRARY_PUBLISH]: AccessScope.SEDE,
    [Permission.LIBRARY_ARCHIVE]: AccessScope.SEDE,
    [Permission.PRINTING_3D_OPERATE]: AccessScope.SEDE,
    [Permission.PRINTING_3D_MANAGE]: AccessScope.SEDE,
  },
  [RolUsuario.JEFE_COORDINADORES]: {
    ...areaManagerGrants,
    [Permission.ATTENDANCE_MANAGE]: AccessScope.GLOBAL,
    [Permission.HOURS_VALIDATE]: AccessScope.GLOBAL,
    [Permission.USERS_READ]: AccessScope.GLOBAL,
    [Permission.USERS_MANAGE]: AccessScope.GLOBAL,
    [Permission.KAIROS_PROJECT_CREATE]: AccessScope.GLOBAL,
    [Permission.ACADEMIC_PROFILE_READ]: AccessScope.GLOBAL,
    [Permission.ACADEMIC_CATALOG_MANAGE]: AccessScope.GLOBAL,
    [Permission.DOCUMENTS_READ]: AccessScope.GLOBAL,
    [Permission.DOCUMENTS_REVIEW]: AccessScope.GLOBAL,
    [Permission.REPORTS_READ]: AccessScope.GLOBAL,
    [Permission.REPORTS_EXPORT]: AccessScope.GLOBAL,
    [Permission.LIBRARY_READ]: AccessScope.GLOBAL,
    [Permission.LIBRARY_DRAFT_CREATE]: AccessScope.GLOBAL,
    [Permission.LIBRARY_REVIEW]: AccessScope.GLOBAL,
    [Permission.LIBRARY_PUBLISH]: AccessScope.GLOBAL,
    [Permission.LIBRARY_ARCHIVE]: AccessScope.GLOBAL,
    [Permission.PRINTING_3D_OPERATE]: AccessScope.GLOBAL,
    [Permission.PRINTING_3D_MANAGE]: AccessScope.GLOBAL,
  },
  [RolUsuario.ADMIN]: Object.fromEntries(
    Object.values(Permission).map((permission) => [
      permission,
      AccessScope.GLOBAL,
    ]),
  ) as RoleGrants,
};

const scopeRank: Record<AccessScope, number> = {
  [AccessScope.SELF]: 0,
  [AccessScope.AREA]: 1,
  [AccessScope.SEDE]: 2,
  [AccessScope.GLOBAL]: 3,
};

export function getAccessScope(
  user: AuthUser | null | undefined,
  permission: Permission,
): AccessScope | null {
  return user ? (permissionsByRole[user.rol][permission] ?? null) : null;
}

/** Materializes the effective grants for client-side capability discovery. */
export function permissionGrants(user: AuthUser): RoleGrants {
  return { ...permissionsByRole[user.rol] };
}

export function can(
  user: AuthUser | null | undefined,
  permission: Permission,
  minimumScope: AccessScope = AccessScope.SELF,
): boolean {
  const grantedScope = getAccessScope(user, permission);
  return (
    grantedScope !== null && scopeRank[grantedScope] >= scopeRank[minimumScope]
  );
}

export function canAccessSede(
  user: AuthUser,
  permission: Permission,
  sedeId: number,
): boolean {
  const scope = getAccessScope(user, permission);

  return (
    scope === AccessScope.GLOBAL ||
    (scope === AccessScope.SEDE && user.sedeId === sedeId)
  );
}

export function canAccessArea(
  user: AuthUser,
  permission: Permission,
  area: { id: number; sedeId: number },
): boolean {
  const scope = getAccessScope(user, permission);

  return (
    scope === AccessScope.GLOBAL ||
    (scope === AccessScope.SEDE && user.sedeId === area.sedeId) ||
    (scope === AccessScope.AREA && user.areaId === area.id)
  );
}
