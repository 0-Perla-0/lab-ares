import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Query, UsePipes } from "@nestjs/common";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { DocumentsService } from "./documents.service";
import { listQuerySchema, requirementSchema, reviewSchema, uploadSchema } from "./documents.schemas";
@Controller("documents") export class DocumentsController { constructor(private readonly documents: DocumentsService) {}
  @Get() @RequirePermissions(Permission.DOCUMENTS_READ) list(@Req() req: Request, @Query(new ZodValidationPipe(listQuerySchema)) query: { userId?: number; page: number; pageSize: number }) { const a=getAuthenticatedUser(req); return this.documents.list(a, query.userId ?? a.id, query.page, query.pageSize).then(data=>({data})); }
  @Post("requirements") @RequirePermissions(Permission.DOCUMENTS_REVIEW) @UsePipes(new ZodValidationPipe(requirementSchema)) create(@Req() req: Request, @Body() body: any) { return this.documents.createRequirement(getAuthenticatedUser(req), body).then(data=>({data})); }
  @Post("versions") @RequirePermissions(Permission.DOCUMENTS_UPLOAD) @UsePipes(new ZodValidationPipe(uploadSchema)) upload(@Req() req: Request, @Body() body: any) { return this.documents.upload(getAuthenticatedUser(req), body).then(data=>({data})); }
  @Post("versions/:id/review") @HttpCode(HttpStatus.OK) @RequirePermissions(Permission.DOCUMENTS_REVIEW) @UsePipes(new ZodValidationPipe(reviewSchema)) review(@Req() req: Request, @Param("id") id: string, @Body() body: any) { return this.documents.review(getAuthenticatedUser(req), id, body).then(data=>({data})); }
  @Get("versions/:id/download") @RequirePermissions(Permission.DOCUMENTS_READ) download(@Req() req: Request, @Param("id") id: string) { return this.documents.download(getAuthenticatedUser(req), id).then(data=>({data})); }
}
