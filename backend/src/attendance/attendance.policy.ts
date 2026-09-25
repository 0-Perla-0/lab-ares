import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../auth/auth-user";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import { ApiException } from "../common/errors/api.exception";

@Injectable()
export class AttendancePolicy {
  scope(user: AuthUser): { areaId?: number; sedeId?: number } {
    const scope = getAccessScope(user, Permission.ATTENDANCE_MANAGE);
    if (scope === AccessScope.GLOBAL) return {};
    if (scope === AccessScope.SEDE && user.sedeId !== null)
      return { sedeId: user.sedeId };
    if (scope === AccessScope.AREA && user.areaId !== null)
      return { areaId: user.areaId };
    throw new ApiException("FORBIDDEN", 403);
  }

  requireManage(
    user: AuthUser,
    attendance: { sedeId: number; areaId: number },
  ) {
    const scope = this.scope(user);
    if (
      (scope.sedeId !== undefined && scope.sedeId !== attendance.sedeId) ||
      (scope.areaId !== undefined && scope.areaId !== attendance.areaId)
    ) {
      throw new ApiException("FORBIDDEN", 403);
    }
  }
}
