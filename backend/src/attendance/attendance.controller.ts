import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";

import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  idempotencyKeySchema,
  registrarAsistenciaSchema,
  type RegistrarAsistenciaInput,
} from "./attendance.schemas";
import { AttendanceService } from "./attendance.service";

const idempotencyKeyPipe = new ZodValidationPipe(idempotencyKeySchema);

@Controller("attendance")
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post("check-in")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ATTENDANCE_CHECK_IN)
  async checkIn(
    @Headers("idempotency-key") rawKey: unknown,
    @Body(new ZodValidationPipe(registrarAsistenciaSchema))
    input: RegistrarAsistenciaInput,
    @Req() request: Request,
  ) {
    const key = idempotencyKeyPipe.transform(rawKey);
    return {
      data: await this.attendance.checkIn(
        getAuthenticatedUser(request),
        key,
        input,
        { ip: request.ip },
      ),
    };
  }

  @Post("check-out")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ATTENDANCE_CHECK_OUT)
  async checkOut(
    @Headers("idempotency-key") rawKey: unknown,
    @Body(new ZodValidationPipe(registrarAsistenciaSchema))
    input: RegistrarAsistenciaInput,
    @Req() request: Request,
  ) {
    const key = idempotencyKeyPipe.transform(rawKey);
    return {
      data: await this.attendance.checkOut(
        getAuthenticatedUser(request),
        key,
        input,
        { ip: request.ip },
      ),
    };
  }

  @Get("me/current")
  @RequirePermissions(Permission.ATTENDANCE_READ)
  async current(@Req() request: Request) {
    return {
      data: await this.attendance.current(getAuthenticatedUser(request).id),
    };
  }

  @Get("me")
  @RequirePermissions(Permission.ATTENDANCE_READ)
  async ownHistory(@Req() request: Request) {
    return {
      data: await this.attendance.ownHistory(getAuthenticatedUser(request).id),
    };
  }
}
