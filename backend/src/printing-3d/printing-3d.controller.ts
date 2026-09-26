import {
  BadRequestException,
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
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  printing3dAssignSchema,
  printing3dExecutionFinishSchema,
  printing3dExecutionStartSchema,
  printing3dIdempotencyKeySchema,
  printing3dJobCreateSchema,
  printing3dJobListSchema,
  printing3dReasonSchema,
  printing3dReviewSchema,
} from "./printing-3d.schemas";
import { Printing3dService } from "./printing-3d.service";

@Controller("printing-3d")
export class Printing3dController {
  constructor(private readonly printing: Printing3dService) {}

  private key(value: string | undefined) {
    const parsed = printing3dIdempotencyKeySchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException("INVALID_IDEMPOTENCY_KEY");
    return parsed.data;
  }

  @Post("jobs")
  @RequirePermissions(Permission.PRINTING_3D_REQUEST)
  create(
    @Req() req: Request,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(printing3dJobCreateSchema)) body: any,
  ) {
    return this.printing
      .create(getAuthenticatedUser(req), body, this.key(idempotencyKey))
      .then((data) => ({ data }));
  }

  @Get("jobs")
  @RequirePermissions(Permission.PRINTING_3D_REQUEST)
  list(
    @Req() req: Request,
    @Query(new ZodValidationPipe(printing3dJobListSchema)) query: any,
  ) {
    return this.printing
      .list(getAuthenticatedUser(req), query)
      .then((data) => ({ data }));
  }

  @Get("jobs/:id")
  @RequirePermissions(Permission.PRINTING_3D_REQUEST)
  detail(@Req() req: Request, @Param("id") id: string) {
    return this.printing
      .detail(getAuthenticatedUser(req), id)
      .then((data) => ({ data }));
  }

  @Post("jobs/:id/review")
  @RequirePermissions(Permission.PRINTING_3D_MANAGE)
  review(
    @Req() req: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(printing3dReviewSchema)) body: any,
  ) {
    return this.printing
      .review(getAuthenticatedUser(req), id, body, this.key(idempotencyKey))
      .then((data) => ({ data }));
  }

  @Post("jobs/:id/assign")
  @RequirePermissions(Permission.PRINTING_3D_MANAGE)
  assign(
    @Req() req: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(printing3dAssignSchema)) body: any,
  ) {
    return this.printing
      .assign(getAuthenticatedUser(req), id, body, this.key(idempotencyKey))
      .then((data) => ({ data }));
  }

  @Post("jobs/:id/executions")
  @RequirePermissions(Permission.PRINTING_3D_OPERATE)
  startExecution(
    @Req() req: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(printing3dExecutionStartSchema)) body: any,
  ) {
    return this.printing
      .startExecution(
        getAuthenticatedUser(req),
        id,
        body,
        this.key(idempotencyKey),
      )
      .then((data) => ({ data }));
  }

  @Post("jobs/:id/executions/:executionId/finish")
  @RequirePermissions(Permission.PRINTING_3D_OPERATE)
  finishExecution(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("executionId") executionId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(printing3dExecutionFinishSchema)) body: any,
  ) {
    return this.printing
      .finishExecution(
        getAuthenticatedUser(req),
        id,
        executionId,
        body,
        this.key(idempotencyKey),
      )
      .then((data) => ({ data }));
  }

  @Post("jobs/:id/retry")
  @RequirePermissions(Permission.PRINTING_3D_OPERATE)
  retry(
    @Req() req: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(printing3dReasonSchema)) body: any,
  ) {
    return this.printing
      .retry(
        getAuthenticatedUser(req),
        id,
        body.motivo,
        this.key(idempotencyKey),
      )
      .then((data) => ({ data }));
  }

  @Post("jobs/:id/cancel")
  @RequirePermissions(Permission.PRINTING_3D_REQUEST)
  cancel(
    @Req() req: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(printing3dReasonSchema)) body: any,
  ) {
    return this.printing
      .cancel(
        getAuthenticatedUser(req),
        id,
        body.motivo,
        this.key(idempotencyKey),
      )
      .then((data) => ({ data }));
  }

  @Get("jobs/:id/download")
  @RequirePermissions(Permission.PRINTING_3D_REQUEST)
  download(@Req() req: Request, @Param("id") id: string) {
    return this.printing
      .download(getAuthenticatedUser(req), id)
      .then((data) => ({ data }));
  }
}
