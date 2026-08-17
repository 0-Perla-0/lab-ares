import type { Request } from "express";

import { ApiException } from "../common/errors/api.exception";
import type { AuthUser } from "./auth-user";

export function getAuthenticatedUser(request: Request): AuthUser {
  if (!request.user) {
    throw new ApiException("UNAUTHORIZED", 401);
  }

  return request.user;
}
