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
import { PositiveIntPipe } from "../common/validation/positive-int.pipe";
import { IdempotencyKey } from "../common/http/idempotency-key.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { idempotencyKeySchema } from "./attendance.schemas";
import {
  attendancePolicySchema,
  batchValidationSchema,
  correctionSchema,
  reviewQuerySchema,
  validationSchema,
} from "./attendance-review.schemas";
import { AttendanceReviewService } from "./attendance-review.service";
import { contingencySchema } from "./attendance-contingency.schemas";
import { RequireFeature } from "../common/domain/feature-policy.guard";
const keyPipe = new ZodValidationPipe(idempotencyKeySchema);
@Controller("attendance")
export class AttendanceReviewController {
  constructor(private readonly service: AttendanceReviewService) {}
  @Post("contingency")
  @RequireFeature("ATTENDANCE.CONTINGENCY")
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  async contingency(
    @Req() request: Request,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(contingencySchema))
    body: z.infer<typeof contingencySchema>,
  ) {
    return {
      data: await this.service.contingency(
        getAuthenticatedUser(request),
        keyPipe.transform(key),
        body,
      ),
    };
  }
  @Get(":id/signals")
  @RequirePermissions(Permission.AUDIT_READ)
  async signals(
    @Req() request: Request,
    @Param("id", new PositiveIntPipe()) id: number,
  ) {
    return {
      data: await this.service.signals(getAuthenticatedUser(request), id),
    };
  }
  @Get("review")
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  async queue(
    @Req() req: Request,
    @Query(new ZodValidationPipe(reviewQuerySchema))
    query: z.infer<typeof reviewQuerySchema>,
  ) {
    return { data: await this.service.queue(getAuthenticatedUser(req), query) };
  }
  @Get(":id/history")
  @RequirePermissions(Permission.ATTENDANCE_SELF_READ)
  async history(
    @Req() req: Request,
    @Param("id", new PositiveIntPipe()) id: number,
  ) {
    return { data: await this.service.history(getAuthenticatedUser(req), id) };
  }
  @Post(":id/validate")
  @RequirePermissions(Permission.HOURS_VALIDATE)
  async validate(
    @Req() req: Request,
    @Param("id", new PositiveIntPipe()) id: number,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(validationSchema))
    body: z.infer<typeof validationSchema>,
  ) {
    return {
      data: await this.service.validate(
        getAuthenticatedUser(req),
        id,
        keyPipe.transform(key),
        body,
      ),
    };
  }
  @Post(":id/correct")
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  async correct(
    @Req() req: Request,
    @Param("id", new PositiveIntPipe()) id: number,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(correctionSchema))
    body: z.infer<typeof correctionSchema>,
  ) {
    return {
      data: await this.service.correct(
        getAuthenticatedUser(req),
        id,
        keyPipe.transform(key),
        body,
      ),
    };
  }
  @Post("validate-batch")
  @RequirePermissions(Permission.HOURS_VALIDATE)
  async batch(
    @Req() req: Request,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(batchValidationSchema))
    body: z.infer<typeof batchValidationSchema>,
  ) {
    return {
      data: await this.service.batch(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        body,
      ),
    };
  }
  @Post("policies/:sedeId")
  @RequirePermissions(Permission.ORGANIZATION_MANAGE)
  async policy(
    @Req() req: Request,
    @IdempotencyKey() key: string,
    @Param("sedeId", new PositiveIntPipe()) sedeId: number,
    @Body(new ZodValidationPipe(attendancePolicySchema))
    body: z.infer<typeof attendancePolicySchema>,
  ) {
    return {
      data: await this.service.publishPolicy(
        getAuthenticatedUser(req),
        key,
        sedeId,
        body,
      ),
    };
  }
}
