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
  actualizarAreaSchema,
  crearAreaSchema,
  type ActualizarAreaInput,
  type CrearAreaInput,
} from "./organization.schemas";
import { AreaService } from "./services/area.service";
import { OrganizationPolicy } from "./organization.policy";

@Controller("organization/areas")
export class AreaController {
  constructor(
    private readonly areas: AreaService,
    private readonly policy: OrganizationPolicy,
  ) {}

  @Get()
  @RequirePermissions(Permission.ORGANIZATION_READ)
  async listar() {
    return { data: await this.areas.listar() };
  }

  @Post()
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async crear(
    @Body(new ZodValidationPipe(crearAreaSchema)) input: CrearAreaInput,
    @Req() request: Request,
  ) {
    this.policy.requireAreaCreation(
      getAuthenticatedUser(request),
      input.sedeId,
    );
    return { data: await this.areas.crear(input) };
  }

  @Get(":id")
  @RequirePermissions(Permission.ORGANIZATION_READ)
  async obtener(@Param("id", new PositiveIntPipe()) id: number) {
    return { data: await this.areas.obtener(id) };
  }

  @Put(":id")
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async actualizar(
    @Param("id", new PositiveIntPipe()) id: number,
    @Body(new ZodValidationPipe(actualizarAreaSchema))
    input: ActualizarAreaInput,
    @Req() request: Request,
  ) {
    await this.policy.requireAreaManagement(
      getAuthenticatedUser(request),
      id,
      input.sedeId,
    );
    return { data: await this.areas.actualizar(id, input) };
  }

  @Delete(":id")
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async desactivar(
    @Param("id", new PositiveIntPipe()) id: number,
    @Req() request: Request,
  ) {
    await this.policy.requireAreaManagement(getAuthenticatedUser(request), id);
    return { data: await this.areas.desactivar(id) };
  }
}
