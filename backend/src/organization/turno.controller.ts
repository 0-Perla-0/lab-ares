import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import type { Request } from "express";

import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { PositiveIntPipe } from "../common/validation/positive-int.pipe";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  actualizarTurnoSchema,
  crearTurnoSchema,
  type ActualizarTurnoInput,
  type CrearTurnoInput,
} from "./organization.schemas";
import { TurnoService } from "./services/turno.service";
import { OrganizationPolicy } from "./organization.policy";

@Controller("organization/turnos")
export class TurnoController {
  constructor(
    private readonly turnos: TurnoService,
    private readonly policy: OrganizationPolicy,
  ) {}

  @Get()
  @RequirePermissions(Permission.ORGANIZATION_READ)
  async listar() {
    return { data: await this.turnos.listar() };
  }

  @Post()
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async crear(
    @Body(new ZodValidationPipe(crearTurnoSchema)) input: CrearTurnoInput,
    @Req() request: Request,
  ) {
    await this.policy.requireTurnoCreation(
      getAuthenticatedUser(request),
      input.areaId,
    );
    return { data: await this.turnos.crear(input) };
  }

  @Get(":id")
  @RequirePermissions(Permission.ORGANIZATION_READ)
  async obtener(@Param("id", new PositiveIntPipe()) id: number) {
    return { data: await this.turnos.obtener(id) };
  }

  @Put(":id")
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async actualizar(
    @Param("id", new PositiveIntPipe()) id: number,
    @Body(new ZodValidationPipe(actualizarTurnoSchema))
    input: ActualizarTurnoInput,
    @Req() request: Request,
  ) {
    await this.policy.requireTurnoManagement(
      getAuthenticatedUser(request),
      id,
      input.areaId,
    );
    return { data: await this.turnos.actualizar(id, input) };
  }

  @Delete(":id")
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async desactivar(
    @Param("id", new PositiveIntPipe()) id: number,
    @Req() request: Request,
  ) {
    await this.policy.requireTurnoManagement(getAuthenticatedUser(request), id);
    return { data: await this.turnos.desactivar(id) };
  }
}
