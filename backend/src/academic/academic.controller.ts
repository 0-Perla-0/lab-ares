import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Query,
} from "@nestjs/common";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { PositiveIntPipe } from "../common/validation/positive-int.pipe";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  catalogSchema,
  strictProfileSchema,
  confirmSchema,
  type CatalogInput,
  type ProfileInput,
} from "./academic.schemas";
import { AcademicService } from "./academic.service";
import { IdempotencyKey } from "../common/http/idempotency-key.decorator";

@Controller("academic")
export class AcademicController {
  constructor(private readonly academic: AcademicService) {}
  @Get("catalogs")
  @RequirePermissions(Permission.ACADEMIC_PROFILE_READ)
  async catalogs(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
  ) {
    return {
      data: await this.academic.catalogs(
        Number(page ?? 1),
        Number(pageSize ?? 50),
        search,
      ),
    };
  }
  @Get("profile/me")
  @RequirePermissions(Permission.ACADEMIC_PROFILE_READ)
  async me(@Req() req: Request) {
    const actor = getAuthenticatedUser(req);
    return { data: await this.academic.profile(actor.id, actor) };
  }
  @Put("profile/me")
  @RequirePermissions(Permission.ACADEMIC_PROFILE_UPDATE)
  async update(
    @IdempotencyKey() key: string,
    @Body(new ZodValidationPipe(strictProfileSchema)) input: ProfileInput,
    @Req() req: Request,
  ) {
    const user = getAuthenticatedUser(req);
    return {
      data: await this.academic.updateProfile(user.id, input, user.id, {
        actor: user,
        key,
      }),
    };
  }
  @Get("profile/:id")
  @RequirePermissions(Permission.ACADEMIC_PROFILE_READ)
  async byId(
    @Param("id", new PositiveIntPipe()) id: number,
    @Req() req: Request,
  ) {
    const actor = getAuthenticatedUser(req);
    return { data: await this.academic.profile(id, actor) };
  }
  @Get("requests/pending")
  @RequirePermissions(Permission.ACADEMIC_PROFILE_READ)
  async pending(
    @Query("page") page: string,
    @Query("pageSize") pageSize: string,
    @Req() req: Request,
  ) {
    return {
      data: await this.academic.pending(
        getAuthenticatedUser(req),
        Number(page ?? 1),
        Number(pageSize ?? 50),
      ),
    };
  }
  @Get("profile/:id/history")
  @RequirePermissions(Permission.ACADEMIC_PROFILE_READ)
  async history(
    @Param("id", new PositiveIntPipe()) id: number,
    @Query("page") page: string,
    @Query("pageSize") pageSize: string,
    @Req() req: Request,
  ) {
    return {
      data: await this.academic.history(
        id,
        getAuthenticatedUser(req),
        Number(page ?? 1),
        Number(pageSize ?? 50),
      ),
    };
  }
  @Post("profile/requests/:id/confirm")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ACADEMIC_CATALOG_MANAGE)
  async confirm(
    @IdempotencyKey() key: string,
    @Param("id", new PositiveIntPipe()) id: number,
    @Body(new ZodValidationPipe(confirmSchema))
    body: { accept: boolean; motivo?: string },
    @Req() req: Request,
  ) {
    return {
      data: await this.academic.confirm(
        id,
        getAuthenticatedUser(req).id,
        body.accept,
        body.motivo,
        { actor: getAuthenticatedUser(req), key },
      ),
    };
  }
  @Post("catalogs/:kind")
  @RequirePermissions(Permission.ACADEMIC_CATALOG_MANAGE)
  async create(
    @Req() req: Request,
    @IdempotencyKey() key: string,
    @Param("kind") kind: string,
    @Body(new ZodValidationPipe(catalogSchema)) input: CatalogInput,
  ) {
    return {
      data: await this.academic.createCatalog(kind, input, {
        actor: getAuthenticatedUser(req),
        key,
      }),
    };
  }
}
