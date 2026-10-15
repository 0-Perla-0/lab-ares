import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { idempotencyKeySchema } from "../attendance/attendance.schemas";
import { VisitsService } from "./visits.service";
import { RequireFeature } from "../common/domain/feature-policy.guard";
import {
  visitActionSchema,
  visitCancelSchema,
  visitCodeSchema,
  visitCreateSchema,
  visitEntrySchema,
  visitIdSchema,
  visitQuerySchema,
} from "./visits.schemas";
const keyPipe = new ZodValidationPipe(idempotencyKeySchema);
@Controller("visits")
export class VisitsController {
  constructor(private readonly service: VisitsService) {}
  @Post("invitations")
  @RequireFeature("VISITS.REQUEST")
  @RequirePermissions(Permission.VISITS_REQUEST)
  async create(
    @Req() req: Request,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(visitCreateSchema))
    body: z.infer<typeof visitCreateSchema>,
  ) {
    return {
      data: await this.service.create(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        body,
      ),
    };
  }
  @Get("invitations")
  @RequirePermissions(Permission.VISITS_REQUEST)
  async list(
    @Req() req: Request,
    @Query(new ZodValidationPipe(visitQuerySchema))
    query: z.infer<typeof visitQuerySchema>,
  ) {
    return { data: await this.service.list(getAuthenticatedUser(req), query) };
  }
  @Get("check/:code")
  @RequirePermissions(Permission.VISITS_CONTROL)
  async check(
    @Req() req: Request,
    @Param("code", new ZodValidationPipe(visitCodeSchema)) code: string,
  ) {
    return { data: await this.service.check(getAuthenticatedUser(req), code) };
  }
  @Post(":id/check-in")
  @RequireFeature("VISITS.REQUEST")
  @RequirePermissions(Permission.VISITS_CONTROL)
  async entry(
    @Req() req: Request,
    @Param("id", new ZodValidationPipe(visitIdSchema)) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(visitEntrySchema))
    body: z.infer<typeof visitEntrySchema>,
  ) {
    return {
      data: await this.service.act(
        getAuthenticatedUser(req),
        id,
        keyPipe.transform(key),
        "ENTRY",
        body,
      ),
    };
  }
  @Post(":id/check-out")
  @RequirePermissions(Permission.VISITS_CONTROL)
  async exit(
    @Req() req: Request,
    @Param("id", new ZodValidationPipe(visitIdSchema)) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(visitActionSchema))
    body: z.infer<typeof visitActionSchema>,
  ) {
    return {
      data: await this.service.act(
        getAuthenticatedUser(req),
        id,
        keyPipe.transform(key),
        "EXIT",
        body,
      ),
    };
  }
  @Post(":id/cancel")
  @RequirePermissions(Permission.VISITS_REQUEST)
  async cancel(
    @Req() req: Request,
    @Param("id", new ZodValidationPipe(visitIdSchema)) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(visitCancelSchema))
    body: z.infer<typeof visitCancelSchema>,
  ) {
    return {
      data: await this.service.act(
        getAuthenticatedUser(req),
        id,
        keyPipe.transform(key),
        "CANCEL",
        body,
      ),
    };
  }
}
