import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Headers,
  Optional,
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
import { ApiException } from "../common/errors/api.exception";
import {
  AdministrativeRecoveryService,
  administrativeRecoverySchema,
} from "./administrative-recovery.service";
import { idempotencyKeySchema } from "../attendance/attendance.schemas";
import type { z } from "zod";

@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly policy: UsersPolicy,
    @Optional() private readonly recovery?: AdministrativeRecoveryService,
  ) {}

  @Get()
  @RequirePermissions(Permission.USERS_READ)
  async listar(@Req() request: Request) {
    const scope = this.policy.listScope(getAuthenticatedUser(request));
    return { data: await this.users.listar(scope) };
  }

  @Post(":id/recovery")
  @RequirePermissions(Permission.USERS_MANAGE)
  async administrativeRecovery(
    @Req() request: Request,
    @Param("id", PositiveIntPipe) id: number,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(administrativeRecoverySchema))
    input: z.infer<typeof administrativeRecoverySchema>,
  ) {
    return {
      data: await this.recovery!.recover(
        getAuthenticatedUser(request),
        id,
        new ZodValidationPipe(idempotencyKeySchema).transform(key),
        input,
      ),
    };
  }

  @Post()
  @RequirePermissions(Permission.USERS_MANAGE)
  async crear(
    @Body(new ZodValidationPipe(crearUsuarioSchema)) input: CrearUsuarioInput,
    @Req() request: Request,
  ) {
    this.policy.requireCreation(getAuthenticatedUser(request), input);
    throw new ApiException("USER_INVITATION_REQUIRED", 410);
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
    if (input.password !== undefined)
      throw new ApiException("USER_PASSWORD_RESET_REQUIRED", 400);
    await this.policy.requireUpdate(getAuthenticatedUser(request), id, input);
    return {
      data: await this.users.actualizar(
        id,
        input,
        getAuthenticatedUser(request).id,
      ),
    };
  }

  @Delete(":id")
  @RequirePermissions(Permission.USERS_MANAGE)
  async darDeBaja(
    @Param("id", new PositiveIntPipe()) id: number,
    @Req() request: Request,
  ) {
    await this.policy.requireDeletion(getAuthenticatedUser(request), id);
    return {
      data: await this.users.darDeBaja(id, getAuthenticatedUser(request).id),
    };
  }
}
