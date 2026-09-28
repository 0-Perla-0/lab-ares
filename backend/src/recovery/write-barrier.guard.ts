import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../database/prisma.service";
import { readWriteBarrier } from "./barrier";

const MUTABLE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_AUTH_MUTATIONS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/mfa/verify",
  "/api/auth/mfa/recovery",
  "/api/auth/recovery/request",
  "/api/auth/recovery/reset",
]);

function isControlPlaneMutation(path: string) {
  return (
    path === "/api/recovery" ||
    path.startsWith("/api/recovery/") ||
    /^\/api\/audit\/manifests\/\d{4}-\d{2}-\d{2}$/.test(path) ||
    ALLOWED_AUTH_MUTATIONS.has(path)
  );
}

@Injectable()
export class WriteBarrierGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (!MUTABLE.has(request.method.toUpperCase())) return true;
    const path = (request.originalUrl ?? request.url).split("?", 1)[0];
    if (isControlPlaneMutation(path)) return true;
    const barrier = await readWriteBarrier(this.prisma);
    if (!barrier.active) return true;
    throw new ApiException("RECOVERY_WRITE_BARRIER_ACTIVE", 503, {
      barrier: {
        active: true,
        runId: barrier.runId,
        version: barrier.version,
        frozenAt: barrier.frozenAt,
        snapshotAt: barrier.snapshotAt,
      },
    });
  }
}
