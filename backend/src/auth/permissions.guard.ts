import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { ApiException } from "../common/errors/api.exception";
import { can, type Permission } from "./permissions";
import { PERMISSIONS_KEY } from "./require-permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    if (!request.user) {
      throw new ApiException("UNAUTHORIZED", 401);
    }

    if (!required.every((permission) => can(request.user, permission))) {
      throw new ApiException("FORBIDDEN", 403);
    }

    return true;
  }
}
