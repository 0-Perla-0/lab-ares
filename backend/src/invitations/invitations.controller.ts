import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { z } from "zod";
import { InvitationsService } from "./invitations.service";
import { RolUsuario } from "../generated/prisma/enums";
import { Public } from "../auth/public.decorator";

const createSchema = z.object({
  targetEmail: z.email(),
  role: z.enum(RolUsuario),
  expiresAt: z.coerce.date().optional(),
  sedeId: z.number().int().positive().nullable().optional(),
  areaId: z.number().int().positive().nullable().optional(),
  turnoId: z.number().int().positive().nullable().optional(),
});
const acceptSchema = z.object({
  codigo: z.string().min(1).max(50),
  password: z.string().min(15).max(128),
});
@Controller("invitations")
export class InvitationsController {
  constructor(private readonly service: InvitationsService) {}
  @Post() @RequirePermissions(Permission.USERS_MANAGE) async create(
    @Body(new ZodValidationPipe(createSchema)) body: any,
    @Req() req: Request,
  ) {
    return {
      data: await this.service.create({
        ...body,
        actor: getAuthenticatedUser(req),
      }),
    };
  }
  @Get() @RequirePermissions(Permission.USERS_MANAGE) async list(
    @Req() req: Request,
  ) {
    return { data: await this.service.list(getAuthenticatedUser(req)) };
  }
  @Public() @Get(":token") async get(@Param("token") token: string) {
    return { data: await this.service.get(token) };
  }
  @Public() @Post(":token/accept") async accept(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(acceptSchema)) body: any,
  ) {
    return {
      data: await this.service.acceptWithPassword(
        token,
        body.password,
        body.codigo,
      ),
    };
  }
  @Post(":id/revoke")
  @HttpCode(200)
  @RequirePermissions(Permission.USERS_MANAGE)
  async revoke(@Param("id") id: string, @Req() req: Request) {
    return { data: await this.service.revoke(id, getAuthenticatedUser(req)) };
  }
}
