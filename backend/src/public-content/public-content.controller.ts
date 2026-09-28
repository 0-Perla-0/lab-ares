import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UsePipes,
} from "@nestjs/common";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { Public } from "../auth/public.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  archivePublicAssetSchema,
  archivePublicPageSchema,
  classifyPublicAssetSchema,
  createPublicPageSchema,
  createPublicVersionSchema,
  listPublicPagesSchema,
} from "./public-content.schemas";
import { PublicContentService } from "./public-content.service";

@Controller("public-content")
export class PublicContentController {
  constructor(private readonly content: PublicContentService) {}

  @Public()
  @Get("pages/:slug")
  page(@Param("slug") slug: string) {
    return this.content.publishedPage(slug).then((data) => ({ data }));
  }

  @Public()
  @Get("faq")
  faq() {
    return this.content.faq().then((data) => ({ data }));
  }

  @Public()
  @Get("assets/:id")
  asset(@Param("id") id: string) {
    return this.content.publicAsset(id).then((data) => ({ data }));
  }

  @Get("admin/pages")
  @RequirePermissions(Permission.PUBLIC_CONTENT_DRAFT)
  listAdmin(
    @Req() req: Request,
    @Query(new ZodValidationPipe(listPublicPagesSchema)) query: any,
  ) {
    return this.content
      .listAdmin(getAuthenticatedUser(req), query)
      .then((data) => ({ data }));
  }

  @Get("admin/pages/:id")
  @RequirePermissions(Permission.PUBLIC_CONTENT_DRAFT)
  detailAdmin(@Req() req: Request, @Param("id") id: string) {
    return this.content
      .detailAdmin(getAuthenticatedUser(req), id)
      .then((data) => ({ data }));
  }

  @Post("admin/pages")
  @RequirePermissions(Permission.PUBLIC_CONTENT_DRAFT)
  @UsePipes(new ZodValidationPipe(createPublicPageSchema))
  createPage(@Req() req: Request, @Body() body: any) {
    return this.content
      .createPage(getAuthenticatedUser(req), body)
      .then((data) => ({ data }));
  }

  @Post("admin/pages/:id/versions")
  @RequirePermissions(Permission.PUBLIC_CONTENT_DRAFT)
  @UsePipes(new ZodValidationPipe(createPublicVersionSchema))
  createVersion(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.content
      .createVersion(getAuthenticatedUser(req), id, body)
      .then((data) => ({ data }));
  }

  @Post("admin/versions/:id/publish")
  @HttpCode(200)
  @RequirePermissions(Permission.PUBLIC_CONTENT_PUBLISH)
  publish(@Req() req: Request, @Param("id") id: string) {
    return this.content
      .publish(getAuthenticatedUser(req), id)
      .then((data) => ({ data }));
  }

  @Post("admin/pages/:id/archive")
  @HttpCode(200)
  @RequirePermissions(Permission.PUBLIC_CONTENT_ARCHIVE)
  archivePage(
    @Req() req: Request,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(archivePublicPageSchema)) body: any,
  ) {
    return this.content
      .archivePage(getAuthenticatedUser(req), id, body.motivo)
      .then((data) => ({ data }));
  }

  @Post("admin/assets")
  @RequirePermissions(Permission.PUBLIC_CONTENT_PUBLISH)
  classifyAsset(
    @Req() req: Request,
    @Body(new ZodValidationPipe(classifyPublicAssetSchema)) body: any,
  ) {
    return this.content
      .classifyAsset(getAuthenticatedUser(req), body)
      .then((data) => ({ data }));
  }

  @Post("admin/assets/:id/archive")
  @HttpCode(200)
  @RequirePermissions(Permission.PUBLIC_CONTENT_ARCHIVE)
  archiveAsset(
    @Req() req: Request,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(archivePublicAssetSchema)) body: any,
  ) {
    return this.content
      .archiveAsset(getAuthenticatedUser(req), id, body.motivo)
      .then((data) => ({ data }));
  }
}
