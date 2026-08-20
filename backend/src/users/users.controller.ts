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
  actualizarUsuarioSchema,
  crearUsuarioSchema,
  type ActualizarUsuarioInput,
  type CrearUsuarioInput,
} from "./user.schemas";
import { UsersPolicy } from "./users.policy";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly policy: UsersPolicy,
  ) {}

  @Get()
  @RequirePermissions(Permission.USERS_READ)
  async listar(@Req() request: Request) {
    const scope = this.policy.listScope(getAuthenticatedUser(request));
    return { data: await this.users.listar(scope) };
  }

  @Post()
  @RequirePermissions(Permission.USERS_MANAGE)
  async crear(
    @Body(new ZodValidationPipe(crearUsuarioSchema)) input: CrearUsuarioInput,
    @Req() request: Request,
  ) {
    this.policy.requireCreation(getAuthenticatedUser(request), input);
    return { data: await this.users.crear(input) };
  }

  @Get(":id")
  @RequirePermissions(Permission.USERS_READ)
  async obtener(
    @Param("id", new PositiveIntPipe()) id: number,
    @Req() request: Request,
  ) {
    await this.policy.requireRead(getAuthenticatedUser(request), id);
    return { data: await this.users.obtener(id) };
  }

  @Put(":id")
  @RequirePermissions(Permission.USERS_MANAGE)
  async actualizar(
    @Param("id", new PositiveIntPipe()) id: number,
    @Body(new ZodValidationPipe(actualizarUsuarioSchema))
    input: ActualizarUsuarioInput,
    @Req() request: Request,
  ) {
    await this.policy.requireUpdate(getAuthenticatedUser(request), id, input);
    return { data: await this.users.actualizar(id, input) };
  }

  @Delete(":id")
  @RequirePermissions(Permission.USERS_MANAGE)
  async darDeBaja(
    @Param("id", new PositiveIntPipe()) id: number,
    @Req() request: Request,
  ) {
    await this.policy.requireDeletion(getAuthenticatedUser(request), id);
    return { data: await this.users.darDeBaja(id) };
  }
}
