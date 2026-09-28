import { Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { AuditQueryService } from "./audit-query.service";
import { auditPeriodSchema, auditQuerySchema } from "./audit.schemas";

@Controller("audit")
export class AuditController {
  constructor(private readonly queries: AuditQueryService) {}

  @Get("me")
  @RequirePermissions(Permission.AUDIT_SELF_READ)
  listMine(
    @Req() request: Request,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: unknown,
  ) {
    return this.queries
      .list(getAuthenticatedUser(request), query as never, true)
      .then((data) => ({ data }));
  }

  @Get("events")
  @RequirePermissions(Permission.AUDIT_READ)
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: unknown,
  ) {
    return this.queries
      .list(getAuthenticatedUser(request), query as never, false)
      .then((data) => ({ data }));
  }

  @Get("export")
  @RequirePermissions(Permission.AUDIT_EXPORT)
  async export(
    @Req() request: Request,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: unknown,
    @Res() response: Response,
  ) {
    const csv = await this.queries.export(
      getAuthenticatedUser(request),
      query as never,
    );
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="audit-events.csv"',
    );
    return response.send(csv);
  }

  @Post("manifests/:period")
  @RequirePermissions(Permission.AUDIT_EXPORT)
  createManifest(
    @Req() request: Request,
    @Param(new ZodValidationPipe(auditPeriodSchema)) params: { period: string },
  ) {
    return this.queries
      .createManifest(getAuthenticatedUser(request), params.period)
      .then((data) => ({ data }));
  }

  @Get("manifests/:period/verify")
  @RequirePermissions(Permission.AUDIT_EXPORT)
  verifyManifest(
    @Req() request: Request,
    @Param(new ZodValidationPipe(auditPeriodSchema)) params: { period: string },
  ) {
    return this.queries
      .verifyManifest(getAuthenticatedUser(request), params.period)
      .then((data) => ({ data }));
  }
}
