import { RolUsuario } from "../../generated/prisma/enums";
import type { AuthUser } from "../auth/types";

export enum Permission {
  ORGANIZATION_READ = "organization:read",
  ORGANIZATION_MANAGE = "organization:manage",
  USERS_READ = "users:read",
  USERS_MANAGE = "users:manage",
}

const noPermissions: ReadonlySet<Permission> = new Set();

const permissionsByRole: Record<RolUsuario, ReadonlySet<Permission>> = {
  [RolUsuario.PRESTADOR]: noPermissions,
  [RolUsuario.COORDINADOR]: noPermissions,
  [RolUsuario.JEFE_COORDINADORES]: noPermissions,
  [RolUsuario.JEFE_AREA]: noPermissions,
  [RolUsuario.JEFE_SEDE]: noPermissions,
  [RolUsuario.ADMIN]: new Set(Object.values(Permission)),
};

export function can(
  user: AuthUser | null | undefined,
  permission: Permission,
): boolean {
  return user ? permissionsByRole[user.rol].has(permission) : false;
}
