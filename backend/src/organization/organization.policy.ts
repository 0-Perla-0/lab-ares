import { Injectable } from "@nestjs/common";

import type { AuthUser } from "../auth/auth-user";
import {
  AccessScope,
  can,
  canAccessArea,
  canAccessSede,
  Permission,
} from "../auth/permissions";
import { ApiException } from "../common/errors/api.exception";
import { notFound } from "../common/errors/domain-error";
import { AreaRepository } from "./repositories/area.repository";
import { TurnoRepository } from "./repositories/turno.repository";

@Injectable()
export class OrganizationPolicy {
  constructor(
    private readonly areas: AreaRepository,
    private readonly turnos: TurnoRepository,
  ) {}

  requireSedeCreation(user: AuthUser): void {
    if (!can(user, Permission.ORGANIZATION_MANAGE, AccessScope.GLOBAL)) {
      throw new ApiException("FORBIDDEN", 403);
    }
  }

  requireSedeManagement(user: AuthUser, sedeId: number): void {
    if (!canAccessSede(user, Permission.ORGANIZATION_MANAGE, sedeId)) {
      throw new ApiException("FORBIDDEN", 403);
    }
  }

  requireAreaCreation(user: AuthUser, sedeId: number): void {
    this.requireSedeManagement(user, sedeId);
  }

  async requireAreaManagement(
    user: AuthUser,
    areaId: number,
    destinationSedeId?: number,
  ): Promise<void> {
    const area = await this.areas.findById(areaId);
    if (!area) throw notFound("AREA_NOT_FOUND");

    this.assertAreaAccess(user, area);

    if (destinationSedeId !== undefined && destinationSedeId !== area.sedeId) {
      this.requireSedeManagement(user, destinationSedeId);
    }
  }

  async requireTurnoCreation(user: AuthUser, areaId: number): Promise<void> {
    const area = await this.areas.findById(areaId);
    if (!area) throw notFound("AREA_NOT_FOUND");

    this.assertAreaAccess(user, area);
  }

  async requireTurnoManagement(
    user: AuthUser,
    turnoId: number,
    destinationAreaId?: number,
  ): Promise<void> {
    const turno = await this.turnos.findById(turnoId);
    if (!turno) throw notFound("TURNO_NOT_FOUND");

    const currentArea = await this.areas.findById(turno.areaId);
    if (!currentArea) throw notFound("AREA_NOT_FOUND");
    this.assertAreaAccess(user, currentArea);

    if (
      destinationAreaId !== undefined &&
      destinationAreaId !== currentArea.id
    ) {
      const destinationArea = await this.areas.findById(destinationAreaId);
      if (!destinationArea) throw notFound("AREA_NOT_FOUND");
      this.assertAreaAccess(user, destinationArea);
    }
  }

  private assertAreaAccess(
    user: AuthUser,
    area: { id: number; sedeId: number },
  ): void {
    if (!canAccessArea(user, Permission.ORGANIZATION_MANAGE, area)) {
      throw new ApiException("FORBIDDEN", 403);
    }
  }
}
