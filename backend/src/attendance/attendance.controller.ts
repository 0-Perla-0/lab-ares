import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { PositiveIntPipe } from "../common/validation/positive-int.pipe";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  attendanceQuerySchema,
  checkInSchema,
  checkOutSchema,
  idempotencyKeySchema,
  manualCloseSchema,
  type AttendanceQuery,
} from "./attendance.schemas";
import { AttendanceService } from "./attendance.service";
import { ConfigService } from "@nestjs/config";
import { clientIp, type SignalInput } from "./attendance-signals";
const keyPipe = new ZodValidationPipe(idempotencyKeySchema);

@Controller("attendance")
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly config: ConfigService,
  ) {}

  private signals(request: Request, coords?: unknown): SignalInput {
    const trusted = this.config
      .get<string>("TRUSTED_PROXY_CIDRS", "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    return {
      coords,
      clientIp: clientIp(
        request.socket.remoteAddress,
        request.headers["x-forwarded-for"],
        trusted,
      ),
    };
  }

  @Get("me")
  @RequirePermissions(Permission.ATTENDANCE_SELF_READ)
  async mine(
    @Req() request: Request,
    @Query(new ZodValidationPipe(attendanceQuerySchema)) query: AttendanceQuery,
  ) {
    return {
      data: await this.attendance.mine(getAuthenticatedUser(request), query),
    };
  }

  @Get("open")
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  async open(
    @Req() request: Request,
    @Query(new ZodValidationPipe(attendanceQuerySchema)) query: AttendanceQuery,
  ) {
    return {
      data: await this.attendance.open(getAuthenticatedUser(request), query),
    };
  }

  @Post("check-in")
  @HttpCode(200)
  @RequirePermissions(Permission.ATTENDANCE_CHECK_IN)
  async checkIn(
    @Req() request: Request,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(checkInSchema)) body: { coords?: unknown },
  ) {
    return {
      data: await this.attendance.checkIn(
        getAuthenticatedUser(request),
        keyPipe.transform(key),
        this.signals(request, body.coords),
      ),
    };
  }

  @Post("check-out")
  @HttpCode(200)
  @RequirePermissions(Permission.ATTENDANCE_CHECK_IN)
  async checkOut(
    @Req() request: Request,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(checkOutSchema))
    body: { attendanceId: number; coords?: unknown },
  ) {
    return {
      data: await this.attendance.checkOut(
        getAuthenticatedUser(request),
        keyPipe.transform(key),
        body.attendanceId,
        this.signals(request, body.coords),
      ),
    };
  }

  @Post(":id/close")
  @HttpCode(200)
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  async close(
    @Req() request: Request,
    @Param("id", new PositiveIntPipe()) id: number,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(manualCloseSchema)) body: { reason: string },
  ) {
    return {
      data: await this.attendance.close(
        getAuthenticatedUser(request),
        keyPipe.transform(key),
        id,
        body.reason,
      ),
    };
  }
}
