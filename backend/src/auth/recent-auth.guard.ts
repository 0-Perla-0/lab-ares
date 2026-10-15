import {
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../common/errors/api.exception";
import { PERMISSIONS_KEY } from "./require-permissions.decorator";
import { Permission } from "./permissions";

export const RECENT_AUTH_KEY = "recent-auth";
export const RequireRecentAuth = () => SetMetadata(RECENT_AUTH_KEY, true);
export const RECENT_AUTH_MS = 15 * 60_000;
const sensitive = new Set<Permission>([
  Permission.USERS_MANAGE,
  Permission.ORGANIZATION_MANAGE,
  Permission.HOURS_VALIDATE,
  Permission.ATTENDANCE_MANAGE,
  Permission.ABSENCES_REVIEW,
  Permission.ABSENCES_APPEAL_RESOLVE,
  Permission.CALENDAR_MANAGE,
  Permission.RETENTION_MANAGE,
  Permission.RETENTION_EXECUTE,
  Permission.RECOVERY_MANAGE,
  Permission.RECOVERY_EXECUTE,
  Permission.OPERATIONS_MANAGE,
  Permission.INVENTORY_MANAGE,
  Permission.DOCUMENTS_REVIEW,
  Permission.ACADEMIC_CATALOG_MANAGE,
  Permission.PUBLIC_CONTENT_PUBLISH,
  Permission.PUBLIC_CONTENT_ARCHIVE,
  Permission.LIBRARY_PUBLISH,
  Permission.LIBRARY_ARCHIVE,
  Permission.GAMIFICATION_MANAGE,
]);

@Injectable()
export class RecentAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method))
      return true;
    const targets = [context.getHandler(), context.getClass()];
    const permissions =
      this.reflector.getAllAndOverride<Permission[]>(
        PERMISSIONS_KEY,
        targets,
      ) ?? [];
    if (
      !this.reflector.getAllAndOverride<boolean>(RECENT_AUTH_KEY, targets) &&
      !permissions.some((p) => sensitive.has(p))
    )
      return true;
    if (!request.user) throw new ApiException("UNAUTHORIZED", 401);
    const mfa = await this.db.userMfa.findUnique({
      where: { userId: request.user.id },
      select: { enabledAt: true },
    });
    const at = request.session.authenticatedAt;
    const now = Date.now();
    if (
      !Number.isFinite(at) ||
      at! > now ||
      now - at! >= RECENT_AUTH_MS ||
      (mfa?.enabledAt && request.session.authenticationFactor !== "mfa")
    ) {
      throw new ApiException("REAUTH_REQUIRED", 403, {
        factor: mfa?.enabledAt ? "mfa" : "password",
        windowSeconds: 900,
      });
    }
    return true;
  }
}
