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
} from "@nestjs/common";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { IdempotencyKey } from "../common/http/idempotency-key.decorator";
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
  create(
    @Req() req: Request,
    @IdempotencyKey() key: string,
    @Body(new ZodValidationPipe(createLibraryDocumentSchema)) body: any,
  ) {
    return this.library
      .create(getAuthenticatedUser(req), key, body)
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
  createVersion(
    @Req() req: Request,
    @IdempotencyKey() key: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createLibraryVersionSchema)) body: any,
  ) {
    return this.library
      .createVersion(getAuthenticatedUser(req), key, id, body)
      .then((data) => ({ data }));
  }

  @Post("versions/:id/submit-review")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LIBRARY_DRAFT_CREATE)
  submitReview(
    @Req() req: Request,
    @IdempotencyKey() key: string,
    @Param("id") id: string,
  ) {
    return this.library
      .submitReview(getAuthenticatedUser(req), key, id)
      .then((data) => ({ data }));
  }

  @Post("versions/:id/review")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LIBRARY_REVIEW)
  review(
    @Req() req: Request,
    @IdempotencyKey() key: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reviewLibraryVersionSchema)) body: any,
  ) {
    return this.library
      .review(getAuthenticatedUser(req), key, id, body)
      .then((data) => ({ data }));
  }

  @Post("versions/:id/publish")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LIBRARY_PUBLISH)
  publish(
    @Req() req: Request,
    @IdempotencyKey() key: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(publishLibraryVersionSchema)) body: any,
  ) {
    return this.library
      .publish(getAuthenticatedUser(req), key, id, body)
      .then((data) => ({ data }));
  }

  @Post(":id/archive")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LIBRARY_ARCHIVE)
  archive(
    @Req() req: Request,
    @IdempotencyKey() key: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(archiveLibraryDocumentSchema)) body: any,
  ) {
    return this.library
      .archive(getAuthenticatedUser(req), key, id, body.motivo)
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
  acknowledge(
    @Req() req: Request,
    @IdempotencyKey() key: string,
    @Param("id") id: string,
  ) {
    return this.library
      .acknowledge(getAuthenticatedUser(req), key, id)
      .then((data) => ({ data }));
  }
}
