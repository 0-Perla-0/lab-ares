import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { z } from "zod";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { PositiveIntPipe } from "../common/validation/positive-int.pipe";
import { KairosService } from "./kairos.service";
import { IdempotencyKey } from "../common/http/idempotency-key.decorator";
import {
  favoriteSchema,
  memberRoleSchema,
  memberSchema,
  projectSchema,
  projectUpdateSchema,
  type ProjectInput,
  type ProjectUpdate,
} from "./kairos.schemas";

@Controller("kairos/projects")
export class KairosController {
  constructor(private readonly service: KairosService) {}
  @Post() @RequirePermissions(Permission.KAIROS_PROJECT_CREATE) create(
    @IdempotencyKey() key: string,
    @Body(new ZodValidationPipe(projectSchema)) body: ProjectInput,
    @Req() req: Request,
  ) {
    return this.service
      .create(getAuthenticatedUser(req), body, key)
      .then((data) => ({ data }));
  }
  @Get() list(
    @Query(
      "page",
      new DefaultValuePipe(1),
      new ZodValidationPipe(z.coerce.number().int().min(1).max(10000)),
    )
    page: number,
    @Query(
      "pageSize",
      new DefaultValuePipe(20),
      new ZodValidationPipe(z.coerce.number().int().min(1).max(100)),
    )
    pageSize: number,
    @Query("search") search: string,
    @Query(
      "favorite",
      new ZodValidationPipe(z.enum(["true", "false"]).optional()),
    )
    favorite: string | undefined,
    @Req() req: Request,
  ) {
    return this.service
      .list(
        getAuthenticatedUser(req),
        page,
        pageSize,
        search,
        favorite === "true" ? true : favorite === "false" ? false : undefined,
      )
      .then((data) => ({ data }));
  }
  @Get(":id") get(@Param("id") id: string, @Req() req: Request) {
    return this.service
      .get(getAuthenticatedUser(req), id)
      .then((data) => ({ data }));
  }
  @Patch(":id") update(
    @IdempotencyKey() key: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(projectUpdateSchema)) body: ProjectUpdate,
    @Req() req: Request,
  ) {
    return this.service
      .update(getAuthenticatedUser(req), id, body, key)
      .then((data) => ({ data }));
  }
  @Post(":id/archive") archive(
    @Param("id") id: string,
    @Req() req: Request,
    @IdempotencyKey() key: string,
  ) {
    return this.service
      .archive(getAuthenticatedUser(req), id, key)
      .then((data) => ({ data }));
  }
  @Post(":id/members") add(
    @IdempotencyKey() key: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(memberSchema))
    body: { usuarioId: number; rol: any },
    @Req() req: Request,
  ) {
    return this.service
      .addMember(getAuthenticatedUser(req), id, body.usuarioId, body.rol, key)
      .then((data) => ({ data }));
  }
  @Patch(":id/members/:userId") role(
    @IdempotencyKey() key: string,
    @Param("id") id: string,
    @Param("userId", PositiveIntPipe) userId: number,
    @Body(new ZodValidationPipe(memberRoleSchema)) body: { rol: any },
    @Req() req: Request,
  ) {
    return this.service
      .changeRole(getAuthenticatedUser(req), id, userId, body.rol, key)
      .then((data) => ({ data }));
  }
  @Post(":id/members/:userId/transfer") transfer(
    @IdempotencyKey() key: string,
    @Param("id") id: string,
    @Param("userId", PositiveIntPipe) userId: number,
    @Req() req: Request,
  ) {
    return this.service
      .transferOwnership(getAuthenticatedUser(req), id, userId, key)
      .then((data) => ({ data }));
  }
  @Delete(":id/members/:userId") remove(
    @IdempotencyKey() key: string,
    @Param("id") id: string,
    @Param("userId", PositiveIntPipe) userId: number,
    @Req() req: Request,
  ) {
    return this.service
      .removeMember(getAuthenticatedUser(req), id, userId, key)
      .then((data) => ({ data }));
  }
  @Put(":id/favorite") favorite(
    @IdempotencyKey() key: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(favoriteSchema)) body: { enabled: boolean },
    @Req() req: Request,
  ) {
    return this.service
      .favorite(getAuthenticatedUser(req), id, body.enabled, key)
      .then((data) => ({ data }));
  }
}
