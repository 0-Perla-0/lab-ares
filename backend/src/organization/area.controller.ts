import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from "@nestjs/common";

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

@Controller("organization/areas")
export class AreaController {
  constructor(private readonly areas: AreaService) {}

  @Get()
  @RequirePermissions(Permission.ORGANIZATION_READ)
  async listar() {
    return { data: await this.areas.listar() };
  }

  @Post()
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async crear(
    @Body(new ZodValidationPipe(crearAreaSchema)) input: CrearAreaInput,
  ) {
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
  ) {
    return { data: await this.areas.actualizar(id, input) };
  }

  @Delete(":id")
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async desactivar(@Param("id", new PositiveIntPipe()) id: number) {
    return { data: await this.areas.desactivar(id) };
  }
}
