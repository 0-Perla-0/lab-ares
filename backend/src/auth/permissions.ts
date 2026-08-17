import { RolUsuario } from "../generated/prisma/enums";
import type { AuthUser } from "./auth-user";

export enum Permission {
  ATTENDANCE_SELF_READ = "attendance:self:read",
  ATTENDANCE_CHECK_IN = "attendance:check-in",
  HOURS_VALIDATE = "hours:validate",
  ORGANIZATION_READ = "organization:read",
  ORGANIZATION_MANAGE = "organization:manage",
  USERS_READ = "users:read",
  USERS_MANAGE = "users:manage",
  KAIROS_PROJECT_CREATE = "kairos:project:create",
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
  // Organization data is a shared catalogue needed by authenticated flows.
  [Permission.ORGANIZATION_READ]: AccessScope.GLOBAL,
};

const areaManagerGrants: RoleGrants = {
  ...commonUserGrants,
  [Permission.USERS_READ]: AccessScope.AREA,
  [Permission.USERS_MANAGE]: AccessScope.AREA,
  [Permission.KAIROS_PROJECT_CREATE]: AccessScope.AREA,
};

const permissionsByRole: Record<RolUsuario, RoleGrants> = {
  [RolUsuario.PRESTADOR]: commonUserGrants,
  [RolUsuario.COORDINADOR]: areaManagerGrants,
  [RolUsuario.JEFE_AREA]: {
    ...areaManagerGrants,
    [Permission.HOURS_VALIDATE]: AccessScope.AREA,
  },
  [RolUsuario.JEFE_SEDE]: {
    ...areaManagerGrants,
    [Permission.HOURS_VALIDATE]: AccessScope.SEDE,
    [Permission.ORGANIZATION_MANAGE]: AccessScope.SEDE,
    [Permission.USERS_READ]: AccessScope.SEDE,
    [Permission.USERS_MANAGE]: AccessScope.SEDE,
    [Permission.KAIROS_PROJECT_CREATE]: AccessScope.SEDE,
  },
  [RolUsuario.JEFE_COORDINADORES]: {
    ...areaManagerGrants,
    [Permission.HOURS_VALIDATE]: AccessScope.GLOBAL,
    [Permission.USERS_READ]: AccessScope.GLOBAL,
    [Permission.USERS_MANAGE]: AccessScope.GLOBAL,
    [Permission.KAIROS_PROJECT_CREATE]: AccessScope.GLOBAL,
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
