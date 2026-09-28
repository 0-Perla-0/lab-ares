import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { LibraryService } from "./library.service";
import {
  archiveLibraryDocumentSchema,
  createLibraryDocumentSchema,
  createLibraryVersionSchema,
  listLibrarySchema,
  publishLibraryVersionSchema,
  reviewLibraryVersionSchema,
} from "./library.schemas";

@Controller("library")
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  @RequirePermissions(Permission.LIBRARY_READ)
  list(
    @Req() req: Request,
    @Query(new ZodValidationPipe(listLibrarySchema)) query: any,
  ) {
    return this.library
      .list(getAuthenticatedUser(req), query)
      .then((data) => ({ data }));
  }

  @Post()
  @RequirePermissions(Permission.LIBRARY_DRAFT_CREATE)
  @UsePipes(new ZodValidationPipe(createLibraryDocumentSchema))
  create(@Req() req: Request, @Body() body: any) {
    return this.library
      .create(getAuthenticatedUser(req), body)
      .then((data) => ({ data }));
  }

  @Get(":id")
  @RequirePermissions(Permission.LIBRARY_READ)
  detail(@Req() req: Request, @Param("id") id: string) {
    return this.library
      .detail(getAuthenticatedUser(req), id)
      .then((data) => ({ data }));
  }

  @Post(":id/versions")
  @RequirePermissions(Permission.LIBRARY_DRAFT_CREATE)
  @UsePipes(new ZodValidationPipe(createLibraryVersionSchema))
  createVersion(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.library
      .createVersion(getAuthenticatedUser(req), id, body)
      .then((data) => ({ data }));
  }

  @Post("versions/:id/submit-review")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LIBRARY_DRAFT_CREATE)
  submitReview(@Req() req: Request, @Param("id") id: string) {
    return this.library
      .submitReview(getAuthenticatedUser(req), id)
      .then((data) => ({ data }));
  }

  @Post("versions/:id/review")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LIBRARY_REVIEW)
  @UsePipes(new ZodValidationPipe(reviewLibraryVersionSchema))
  review(@Req() req: Request, @Param("id") id: string, @Body() body: any) {
    return this.library
      .review(getAuthenticatedUser(req), id, body)
      .then((data) => ({ data }));
  }

  @Post("versions/:id/publish")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LIBRARY_PUBLISH)
  @UsePipes(new ZodValidationPipe(publishLibraryVersionSchema))
  publish(@Req() req: Request, @Param("id") id: string, @Body() body: any) {
    return this.library
      .publish(getAuthenticatedUser(req), id, body)
      .then((data) => ({ data }));
  }

  @Post(":id/archive")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LIBRARY_ARCHIVE)
  @UsePipes(new ZodValidationPipe(archiveLibraryDocumentSchema))
  archive(@Req() req: Request, @Param("id") id: string, @Body() body: any) {
    return this.library
      .archive(getAuthenticatedUser(req), id, body.motivo)
      .then((data) => ({ data }));
  }

  @Get("versions/:id/download")
  @RequirePermissions(Permission.LIBRARY_READ)
  download(@Req() req: Request, @Param("id") id: string) {
    return this.library
      .download(getAuthenticatedUser(req), id)
      .then((data) => ({ data }));
  }

  @Post("versions/:id/acknowledge")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LIBRARY_ACKNOWLEDGE)
  acknowledge(@Req() req: Request, @Param("id") id: string) {
    return this.library
      .acknowledge(getAuthenticatedUser(req), id)
      .then((data) => ({ data }));
  }
}
