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
  actualizarSedeSchema,
  crearSedeSchema,
  type ActualizarSedeInput,
  type CrearSedeInput,
} from "./organization.schemas";
import { SedeService } from "./services/sede.service";

@Controller("organization/sedes")
export class SedeController {
  constructor(private readonly sedes: SedeService) {}

  @Get()
  @RequirePermissions(Permission.ORGANIZATION_READ)
  async listar() {
    return { data: await this.sedes.listar() };
  }

  @Post()
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async crear(
    @Body(new ZodValidationPipe(crearSedeSchema)) input: CrearSedeInput,
  ) {
    return { data: await this.sedes.crear(input) };
  }

  @Get(":id")
  @RequirePermissions(Permission.ORGANIZATION_READ)
  async obtener(@Param("id", new PositiveIntPipe()) id: number) {
    return { data: await this.sedes.obtener(id) };
  }

  @Put(":id")
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async actualizar(
    @Param("id", new PositiveIntPipe()) id: number,
    @Body(new ZodValidationPipe(actualizarSedeSchema))
    input: ActualizarSedeInput,
  ) {
    return { data: await this.sedes.actualizar(id, input) };
  }

  @Delete(":id")
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async desactivar(@Param("id", new PositiveIntPipe()) id: number) {
    return { data: await this.sedes.desactivar(id) };
  }
}
