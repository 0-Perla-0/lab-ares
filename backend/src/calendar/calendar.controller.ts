import {
  Body,
  Controller,
  Delete,
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
import {
  calendarQuerySchema,
  createExceptionSchema,
  exceptionSchema,
  resourceId,
  revokeExceptionSchema,
  type ExceptionInput,
} from "./calendar.schemas";
import { CalendarService } from "./calendar.service";
const keyPipe = new ZodValidationPipe(idempotencyKeySchema);
const idPipe = new ZodValidationPipe(resourceId);
@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}
  @Get("events")
  @RequirePermissions(Permission.CALENDAR_READ)
  async events(
    @Req() req: Request,
    @Query(new ZodValidationPipe(calendarQuerySchema))
    query: z.infer<typeof calendarQuerySchema>,
  ) {
    return {
      data: await this.calendar.events(
        getAuthenticatedUser(req),
        query.from,
        query.to,
      ),
    };
  }
  @Post("exceptions/preview")
  @RequirePermissions(Permission.CALENDAR_MANAGE)
  async preview(
    @Req() req: Request,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(exceptionSchema)) input: ExceptionInput,
  ) {
    return {
      data: await this.calendar.preview(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        input,
      ),
    };
  }
  @Post("exceptions")
  @RequirePermissions(Permission.CALENDAR_MANAGE)
  async create(
    @Req() req: Request,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(createExceptionSchema))
    input: z.infer<typeof createExceptionSchema>,
  ) {
    return {
      data: await this.calendar.create(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        input.exception,
        input.previewId,
        input.confirmDefinitive,
      ),
    };
  }
  @Post("exceptions/:id/revoke-preview")
  @RequirePermissions(Permission.CALENDAR_MANAGE)
  async revokePreview(
    @Req() req: Request,
    @Param("id", idPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(z.strictObject({}))) _input: object,
  ) {
    return {
      data: await this.calendar.revokePreview(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        id,
      ),
    };
  }
  @Delete("exceptions/:id")
  @RequirePermissions(Permission.CALENDAR_MANAGE)
  async revoke(
    @Req() req: Request,
    @Param("id", idPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(revokeExceptionSchema))
    input: z.infer<typeof revokeExceptionSchema>,
  ) {
    return {
      data: await this.calendar.revoke(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        id,
        input.motivo,
        input.previewId,
        input.confirmDefinitive,
      ),
    };
  }
}
