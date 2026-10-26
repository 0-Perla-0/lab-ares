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
import { IdempotencyKey } from "../common/http/idempotency-key.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  actualizarSedeSchema,
  crearSedeSchema,
  type ActualizarSedeInput,
  type CrearSedeInput,
} from "./organization.schemas";
import { SedeService } from "./services/sede.service";
import { OrganizationPolicy } from "./organization.policy";

@Controller("organization/sedes")
export class SedeController {
  constructor(
    private readonly sedes: SedeService,
    private readonly policy: OrganizationPolicy,
  ) {}

  @Get()
  @RequirePermissions(Permission.ORGANIZATION_READ)
  async listar() {
    return { data: await this.sedes.listar() };
  }

  @Post()
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async crear(
    @IdempotencyKey() key: string,
    @Body(new ZodValidationPipe(crearSedeSchema)) input: CrearSedeInput,
    @Req() request: Request,
  ) {
    this.policy.requireSedeCreation(getAuthenticatedUser(request));
    return {
      data: await this.sedes.crear(getAuthenticatedUser(request), key, input),
    };
  }

  @Get(":id")
  @RequirePermissions(Permission.ORGANIZATION_READ)
  async obtener(@Param("id", new PositiveIntPipe()) id: number) {
    return { data: await this.sedes.obtener(id) };
  }

  @Put(":id")
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async actualizar(
    @IdempotencyKey() key: string,
    @Param("id", new PositiveIntPipe()) id: number,
    @Body(new ZodValidationPipe(actualizarSedeSchema))
    input: ActualizarSedeInput,
    @Req() request: Request,
  ) {
    this.policy.requireSedeManagement(getAuthenticatedUser(request), id);
    return {
      data: await this.sedes.actualizar(
        getAuthenticatedUser(request),
        key,
        id,
        input,
      ),
    };
  }

  @Delete(":id")
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async desactivar(
    @IdempotencyKey() key: string,
    @Param("id", new PositiveIntPipe()) id: number,
    @Req() request: Request,
  ) {
    this.policy.requireSedeManagement(getAuthenticatedUser(request), id);
    return {
      data: await this.sedes.desactivar(getAuthenticatedUser(request), key, id),
    };
  }
}
