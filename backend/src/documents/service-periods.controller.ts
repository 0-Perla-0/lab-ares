import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { IdempotencyKey } from "../common/http/idempotency-key.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { ServicePeriodsService } from "./service-periods.service";
import {
  servicePeriodCreateSchema,
  servicePeriodListSchema,
  servicePeriodTransitionSchema,
  type ServicePeriodCreate,
  type ServicePeriodTransition,
} from "./service-periods.schemas";
import { z } from "zod";
const periodId = new ZodValidationPipe(z.string().regex(/^c[a-z0-9]{20,30}$/));
@Controller("service-periods")
export class ServicePeriodsController {
  constructor(private readonly periods: ServicePeriodsService) {}
  @Get()
  @RequirePermissions(Permission.DOCUMENTS_READ)
  async list(
    @Req() req: Request,
    @Query(new ZodValidationPipe(servicePeriodListSchema))
    query: z.infer<typeof servicePeriodListSchema>,
  ) {
    const actor = getAuthenticatedUser(req);
    return {
      data: await this.periods.list(
        actor,
        query.userId ?? actor.id,
        query.page,
        query.pageSize,
      ),
    };
  }
  @Post()
  @RequirePermissions(Permission.DOCUMENTS_REVIEW)
  async create(
    @Req() req: Request,
    @IdempotencyKey() key: string,
    @Body(new ZodValidationPipe(servicePeriodCreateSchema))
    body: ServicePeriodCreate,
  ) {
    return {
      data: await this.periods.create(getAuthenticatedUser(req), key, body),
    };
  }
  @Post(":id/transition")
  @RequirePermissions(Permission.DOCUMENTS_REVIEW)
  async transition(
    @Req() req: Request,
    @IdempotencyKey() key: string,
    @Param("id", periodId) id: string,
    @Body(new ZodValidationPipe(servicePeriodTransitionSchema))
    body: ServicePeriodTransition,
  ) {
    return {
      data: await this.periods.transition(
        getAuthenticatedUser(req),
        key,
        id,
        body,
      ),
    };
  }
}
