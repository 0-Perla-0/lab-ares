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
import { resourceId } from "../calendar/calendar.schemas";
import { AbsencesService } from "./absences.service";
import {
  absenceQuerySchema,
  appealResolutionSchema,
  appealSchema,
  justificationSchema,
  resolutionSchema,
} from "./absences.schemas";
const keyPipe = new ZodValidationPipe(idempotencyKeySchema);
const idPipe = new ZodValidationPipe(resourceId);
@Controller("absences")
export class AbsencesController {
  constructor(private readonly absences: AbsencesService) {}
  @Get("me")
  @RequirePermissions(Permission.ABSENCES_SELF)
  async mine(
    @Req() req: Request,
    @Query(new ZodValidationPipe(absenceQuerySchema))
    query: z.infer<typeof absenceQuerySchema>,
  ) {
    return { data: await this.absences.list(getAuthenticatedUser(req), query) };
  }
  @Get("queue")
  @RequirePermissions(Permission.ABSENCES_REVIEW)
  async queue(
    @Req() req: Request,
    @Query(new ZodValidationPipe(absenceQuerySchema))
    query: z.infer<typeof absenceQuerySchema>,
  ) {
    return {
      data: await this.absences.list(getAuthenticatedUser(req), query, true),
    };
  }
  @Post(":id/justify")
  @RequirePermissions(Permission.ABSENCES_SELF)
  async justify(
    @Req() req: Request,
    @Param("id", idPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(justificationSchema))
    input: z.infer<typeof justificationSchema>,
  ) {
    return {
      data: await this.absences.justify(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        id,
        input,
      ),
    };
  }
  @Post(":id/resolve")
  @RequirePermissions(Permission.ABSENCES_REVIEW)
  async resolve(
    @Req() req: Request,
    @Param("id", idPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(resolutionSchema))
    input: z.infer<typeof resolutionSchema>,
  ) {
    return {
      data: await this.absences.resolve(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        id,
        input,
      ),
    };
  }
  @Post(":id/appeal")
  @RequirePermissions(Permission.ABSENCES_SELF)
  async appeal(
    @Req() req: Request,
    @Param("id", idPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(appealSchema))
    input: z.infer<typeof appealSchema>,
  ) {
    return {
      data: await this.absences.appeal(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        id,
        input,
      ),
    };
  }
  @Post(":id/resolve-appeal")
  @RequirePermissions(Permission.ABSENCES_APPEAL_RESOLVE)
  async resolveAppeal(
    @Req() req: Request,
    @Param("id", idPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(appealResolutionSchema))
    input: z.infer<typeof appealResolutionSchema>,
  ) {
    return {
      data: await this.absences.resolveAppeal(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        id,
        input,
      ),
    };
  }
  @Get(":id/evidence/:archivoId/download")
  @RequirePermissions(Permission.ABSENCES_SELF)
  async download(
    @Req() req: Request,
    @Param("id", idPipe) id: string,
    @Param(
      "archivoId",
      new ZodValidationPipe(z.string().regex(/^[a-f0-9]{30}$/)),
    )
    archivoId: string,
  ) {
    return {
      data: await this.absences.download(
        getAuthenticatedUser(req),
        id,
        archivoId,
      ),
    };
  }
}
