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
  actualizarTurnoSchema,
  crearTurnoSchema,
  type ActualizarTurnoInput,
  type CrearTurnoInput,
} from "./organization.schemas";
import { TurnoService } from "./services/turno.service";

@Controller("organization/turnos")
export class TurnoController {
  constructor(private readonly turnos: TurnoService) {}

  @Get()
  @RequirePermissions(Permission.ORGANIZATION_READ)
  async listar() {
    return { data: await this.turnos.listar() };
  }

  @Post()
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async crear(
    @Body(new ZodValidationPipe(crearTurnoSchema)) input: CrearTurnoInput,
  ) {
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
  ) {
    return { data: await this.turnos.actualizar(id, input) };
  }

  @Delete(":id")
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async desactivar(@Param("id", new PositiveIntPipe()) id: number) {
    return { data: await this.turnos.desactivar(id) };
  }
}
