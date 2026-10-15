import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Query,
} from "@nestjs/common";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { DocumentsService } from "./documents.service";
import { IdempotencyKey } from "../common/http/idempotency-key.decorator";
import {
  type FormalizationInput,
  formalizationSchema,
} from "./documents.schemas";
import {
  listQuerySchema,
  requirementSchema,
  reviewSchema,
  uploadSchema,
} from "./documents.schemas";
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}
  @Get("formalizations")
  @RequirePermissions(Permission.DOCUMENTS_READ)
  async formalizations(
    @Req() req: Request,
    @Query(new ZodValidationPipe(listQuerySchema)) query: { userId?: number },
  ) {
    const actor = getAuthenticatedUser(req);
    return {
      data: await this.documents.formalizations(
        actor,
        query.userId ?? actor.id,
      ),
    };
  }
  @Post("formalizations")
  @RequirePermissions(Permission.DOCUMENTS_REVIEW)
  async formalize(
    @Req() req: Request,
    @IdempotencyKey() key: string,
    @Body(new ZodValidationPipe(formalizationSchema)) body: FormalizationInput,
  ) {
    return {
      data: await this.documents.formalize(
        getAuthenticatedUser(req),
        key,
        body,
      ),
    };
  }
  @Get() @RequirePermissions(Permission.DOCUMENTS_READ) list(
    @Req() req: Request,
    @Query(new ZodValidationPipe(listQuerySchema))
    query: { userId?: number; page: number; pageSize: number },
  ) {
    const a = getAuthenticatedUser(req);
    return this.documents
      .list(a, query.userId ?? a.id, query.page, query.pageSize)
      .then((data) => ({ data }));
  }
  @Post("requirements")
  @RequirePermissions(Permission.DOCUMENTS_REVIEW)
  create(
    @Req() req: Request,
    @Body(new ZodValidationPipe(requirementSchema)) body: any,
    @IdempotencyKey() key: string,
  ) {
    return this.documents
      .createRequirement(getAuthenticatedUser(req), body, key)
      .then((data) => ({ data }));
  }
  @Post("versions")
  @RequirePermissions(Permission.DOCUMENTS_UPLOAD)
  upload(
    @Req() req: Request,
    @Body(new ZodValidationPipe(uploadSchema)) body: any,
    @IdempotencyKey() key: string,
  ) {
    return this.documents
      .upload(getAuthenticatedUser(req), body, key)
      .then((data) => ({ data }));
  }
  @Post("versions/:id/review")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.DOCUMENTS_REVIEW)
  review(
    @Req() req: Request,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reviewSchema)) body: any,
    @IdempotencyKey() key: string,
  ) {
    return this.documents
      .review(getAuthenticatedUser(req), id, body, key)
      .then((data) => ({ data }));
  }
  @Get("versions/:id/download")
  @RequirePermissions(Permission.DOCUMENTS_READ)
  download(@Req() req: Request, @Param("id") id: string) {
    return this.documents
      .download(getAuthenticatedUser(req), id)
      .then((data) => ({ data }));
  }
}
