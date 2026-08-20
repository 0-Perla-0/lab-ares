import { Injectable } from "@nestjs/common";

import type { AuthUser } from "../auth/auth-user";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import { ApiException } from "../common/errors/api.exception";
import { notFound } from "../common/errors/domain-error";
import { RolUsuario } from "../generated/prisma/enums";
import type { ActualizarUsuarioInput } from "./user.schemas";
import {
  UsersRepository,
  type PublicUser,
  type UserListScope,
} from "./users.repository";

const roleRank: Record<RolUsuario, number> = {
  [RolUsuario.PRESTADOR]: 0,
  [RolUsuario.COORDINADOR]: 1,
  [RolUsuario.JEFE_AREA]: 2,
  [RolUsuario.JEFE_SEDE]: 3,
  [RolUsuario.JEFE_COORDINADORES]: 4,
  [RolUsuario.ADMIN]: 5,
};

type Placement = Pick<PublicUser, "sedeId" | "areaId">;

@Injectable()
export class UsersPolicy {
  constructor(private readonly users: UsersRepository) {}

  listScope(user: AuthUser): UserListScope {
    const scope = getAccessScope(user, Permission.USERS_READ);

    if (scope === AccessScope.GLOBAL) return { type: "global" };
    if (scope === AccessScope.SEDE && user.sedeId !== null) {
      return { type: "sede", sedeId: user.sedeId };
    }
    if (scope === AccessScope.AREA && user.areaId !== null) {
      return { type: "area", areaId: user.areaId };
    }

    throw new ApiException("FORBIDDEN", 403);
  }

  requireCreation(
    actor: AuthUser,
    target: Placement & { rol: RolUsuario },
  ): void {
    this.assertPlacementAccess(actor, Permission.USERS_MANAGE, target);
    this.assertManageableRole(actor, target.rol);
  }

  async requireRead(actor: AuthUser, id: number): Promise<void> {
    const target = await this.findTarget(id);
    this.assertPlacementAccess(actor, Permission.USERS_READ, target);
  }

  async requireUpdate(
    actor: AuthUser,
    id: number,
    input: ActualizarUsuarioInput,
  ): Promise<void> {
    const target = await this.findTarget(id);
    this.assertPlacementAccess(actor, Permission.USERS_MANAGE, target);
    this.assertManageableRole(actor, target.rol);

    const destination = {
      sedeId: input.sedeId === undefined ? target.sedeId : input.sedeId,
      areaId: input.areaId === undefined ? target.areaId : input.areaId,
    };
    this.assertPlacementAccess(actor, Permission.USERS_MANAGE, destination);
    this.assertManageableRole(actor, input.rol ?? target.rol);
  }

  async requireDeletion(actor: AuthUser, id: number): Promise<void> {
    if (actor.id === id) {
      throw new ApiException("SELF_DELETION_NOT_ALLOWED", 409);
    }
    const target = await this.findTarget(id);
    this.assertPlacementAccess(actor, Permission.USERS_MANAGE, target);
    this.assertManageableRole(actor, target.rol);
  }

  private async findTarget(id: number): Promise<PublicUser> {
    const target = await this.users.findById(id);
    if (!target) throw notFound("USER_NOT_FOUND");
    return target;
  }

  private assertPlacementAccess(
    actor: AuthUser,
    permission: Permission.USERS_READ | Permission.USERS_MANAGE,
    target: Placement,
  ): void {
    const scope = getAccessScope(actor, permission);
    const allowed =
      scope === AccessScope.GLOBAL ||
      (scope === AccessScope.SEDE &&
        actor.sedeId !== null &&
        actor.sedeId === target.sedeId) ||
      (scope === AccessScope.AREA &&
        actor.areaId !== null &&
        actor.areaId === target.areaId);

    if (!allowed) throw new ApiException("FORBIDDEN", 403);
  }

  private assertManageableRole(actor: AuthUser, targetRole: RolUsuario): void {
    if (roleRank[targetRole] > roleRank[actor.rol]) {
      throw new ApiException("FORBIDDEN", 403);
    }
  }
}
