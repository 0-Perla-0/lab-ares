import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { ApiException } from "../common/errors/api.exception";
import { EstadoUsuario } from "../generated/prisma/enums";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { UserRepository } from "./user.repository";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.session.userId;

    if (!Number.isInteger(userId) || (userId ?? 0) <= 0) {
      throw new ApiException("UNAUTHORIZED", 401);
    }

    const user = await this.users.findByIdForSession(userId as number);

    if (!user || user.estado !== EstadoUsuario.ACTIVO) {
      request.session.destroy(() => undefined);
      throw new ApiException("UNAUTHORIZED", 401);
    }

    const { passwordHash: _passwordHash, ...authUser } = user;
    request.user = authUser;

    return true;
  }
}
