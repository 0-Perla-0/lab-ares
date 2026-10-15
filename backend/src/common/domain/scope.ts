import type { AuthUser } from "../../auth/auth-user";
import {
  AccessScope,
  getAccessScope,
  Permission,
} from "../../auth/permissions";
import { ApiException } from "../errors/api.exception";

export function organizationalScope(actor: AuthUser, permission: Permission) {
  const scope = getAccessScope(actor, permission);
  if (scope === AccessScope.GLOBAL) return {};
  if (scope === AccessScope.SEDE && actor.sedeId)
    return { sedeId: actor.sedeId };
  if (scope === AccessScope.AREA && actor.areaId && actor.sedeId)
    return { sedeId: actor.sedeId, areaId: actor.areaId };
  throw new ApiException("FORBIDDEN", 403);
}
export function requireOrganization(
  actor: AuthUser,
  permission: Permission,
  row: { sedeId: number; areaId: number | null },
) {
  const scope = organizationalScope(actor, permission);
  if (
    (scope.sedeId !== undefined && scope.sedeId !== row.sedeId) ||
    (scope.areaId !== undefined && scope.areaId !== row.areaId)
  )
    throw new ApiException("FORBIDDEN", 403);
}
