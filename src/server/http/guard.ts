import type { AuthUser } from "../auth/types";
import { can, type Permission } from "../permissions/permissions";

import { errorResponse, type Parsed } from "./responses";

/**
 * Guard de la capa API: corta la petición antes de tocar Services o
 * Repositories. Distingue "no sé quién eres" (401) de "sé quién eres y no
 * puedes" (403). El código UNAUTHORIZED es el mismo que ya usa /api/auth/me.
 */
export function requirePermission(
  locals: App.Locals,
  permission: Permission,
): Parsed<AuthUser> {
  const user = locals.user;

  if (!user) {
    return { success: false, response: errorResponse("UNAUTHORIZED", 401) };
  }

  if (!can(user, permission)) {
    return { success: false, response: errorResponse("FORBIDDEN", 403) };
  }

  return { success: true, data: user };
}
