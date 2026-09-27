import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";

import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { OperationsService } from "./operations.service";
import {
  claimJobApiSchema,
  completeJobApiSchema,
  createIncidentSchema,
  createJobSchema,
  failJobApiSchema,
  operationsListSchema,
  resolutionSchema,
  updateIncidentSchema,
} from "./operations.schemas";

@Controller("operations")
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get("status")
  @RequirePermissions(Permission.OPERATIONS_READ)
  status() {
    return this.operations.status().then((data) => ({ data }));
  }

  @Get("jobs")
  @RequirePermissions(Permission.OPERATIONS_READ)
  listJobs(@Query(new ZodValidationPipe(operationsListSchema)) query: unknown) {
    return this.operations.listJobs(query as never).then((data) => ({ data }));
  }

  @Post("jobs")
  @RequirePermissions(Permission.OPERATIONS_MANAGE)
  createJob(
    @Req() request: Request,
    @Body(new ZodValidationPipe(createJobSchema)) body: unknown,
  ) {
    return this.operations
      .createJob(body as never, getAuthenticatedUser(request))
      .then((data) => ({ data }));
  }

  @Post("jobs/:id/claim")
  @RequirePermissions(Permission.OPERATIONS_MANAGE)
  claimJob(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(claimJobApiSchema))
    body: {
      leaseMs?: number;
    },
  ) {
    const actor = getAuthenticatedUser(request);
    return this.operations
      .claimJob(id, { ...body, owner: `user:${actor.id}` }, actor)
      .then((data) => ({ data }));
  }

  @Post("jobs/:id/complete")
  @RequirePermissions(Permission.OPERATIONS_MANAGE)
  completeJob(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(completeJobApiSchema))
    body: {
      result?: Record<string, unknown>;
    },
  ) {
    const actor = getAuthenticatedUser(request);
    return this.operations
      .completeJob(id, { ...body, owner: `user:${actor.id}` }, actor)
      .then((data) => ({ data }));
  }

  @Post("jobs/:id/fail")
  @RequirePermissions(Permission.OPERATIONS_MANAGE)
  failJob(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(failJobApiSchema))
    body: {
      errorCode: string;
    },
  ) {
    const actor = getAuthenticatedUser(request);
    return this.operations
      .failJob(id, { ...body, owner: `user:${actor.id}` }, actor)
      .then((data) => ({ data }));
  }

  @Get("alerts")
  @RequirePermissions(Permission.OPERATIONS_READ)
  listAlerts(
    @Query(new ZodValidationPipe(operationsListSchema)) query: unknown,
  ) {
    return this.operations
      .listAlerts(query as never)
      .then((data) => ({ data }));
  }

  @Post("alerts/:id/acknowledge")
  @RequirePermissions(Permission.OPERATIONS_MANAGE)
  acknowledgeAlert(@Req() request: Request, @Param("id") id: string) {
    return this.operations
      .acknowledgeAlert(getAuthenticatedUser(request), id)
      .then((data) => ({ data }));
  }

  @Post("alerts/:id/resolve")
  @RequirePermissions(Permission.OPERATIONS_MANAGE)
  resolveAlert(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolutionSchema))
    body: {
      resolution: string;
    },
  ) {
    return this.operations
      .resolveAlert(getAuthenticatedUser(request), id, body.resolution)
      .then((data) => ({ data }));
  }

  @Get("incidents")
  @RequirePermissions(Permission.OPERATIONS_READ)
  listIncidents(
    @Query(new ZodValidationPipe(operationsListSchema)) query: unknown,
  ) {
    return this.operations
      .listIncidents(query as never)
      .then((data) => ({ data }));
  }

  @Post("incidents")
  @RequirePermissions(Permission.OPERATIONS_MANAGE)
  createIncident(
    @Req() request: Request,
    @Body(new ZodValidationPipe(createIncidentSchema)) body: unknown,
  ) {
    return this.operations
      .createIncident(getAuthenticatedUser(request), body as never)
      .then((data) => ({ data }));
  }

  @Patch("incidents/:id")
  @RequirePermissions(Permission.OPERATIONS_MANAGE)
  updateIncident(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateIncidentSchema)) body: unknown,
  ) {
    return this.operations
      .updateIncident(getAuthenticatedUser(request), id, body as never)
      .then((data) => ({ data }));
  }
}
