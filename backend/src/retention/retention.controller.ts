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
import { z } from "zod";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { Permission } from "../auth/permissions";
import { ApiException } from "../common/errors/api.exception";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  legalHoldCreateSchema,
  legalHoldListSchema,
  legalHoldReleaseSchema,
  retentionIdempotencyKeySchema,
  retentionRecordCreateSchema,
  retentionRecordListSchema,
  retentionRuleApproveSchema,
  retentionRuleCreateSchema,
  retentionRuleListSchema,
  suppressionBatchCreateSchema,
  suppressionBatchListSchema,
  suppressionReasonSchema,
  suppressionRegistryListSchema,
  suppressionRequestCreateSchema,
  suppressionRequestListSchema,
  suppressionRequestResolveSchema,
} from "./retention.schemas";
import { RetentionService } from "./retention.service";

@Controller("retention")
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  private idempotencyKey(value: string | undefined) {
    const parsed = retentionIdempotencyKeySchema.safeParse(value);
    if (!parsed.success) {
      throw new ApiException(
        "VALIDATION_ERROR",
        400,
        z.treeifyError(parsed.error),
      );
    }
    return parsed.data;
  }

  @Get("rules")
  @RequirePermissions(Permission.RETENTION_READ)
  async listRules(
    @Req() req: Request,
    @Query(new ZodValidationPipe(retentionRuleListSchema)) query: any,
  ) {
    return {
      data: await this.retention.listRules(getAuthenticatedUser(req), query),
    };
  }
  @Post("rules")
  @RequirePermissions(Permission.RETENTION_MANAGE)
  async createRule(
    @Req() req: Request,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(retentionRuleCreateSchema)) body: any,
  ) {
    return {
      data: await this.retention.createRule(
        getAuthenticatedUser(req),
        body,
        this.idempotencyKey(key),
      ),
    };
  }
  @Post("rules/:id/approve")
  @HttpCode(200)
  @RequirePermissions(Permission.RETENTION_MANAGE)
  async approveRule(
    @Req() req: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(retentionRuleApproveSchema)) body: any,
  ) {
    return {
      data: await this.retention.approveRule(
        getAuthenticatedUser(req),
        id,
        body.referenciaAprobacion,
        this.idempotencyKey(key),
      ),
    };
  }

  @Get("records")
  @RequirePermissions(Permission.RETENTION_READ)
  async listRecords(
    @Req() req: Request,
    @Query(new ZodValidationPipe(retentionRecordListSchema)) query: any,
  ) {
    return {
      data: await this.retention.listRecords(getAuthenticatedUser(req), query),
    };
  }
  @Post("records")
  @RequirePermissions(Permission.RETENTION_MANAGE)
  async registerRecord(
    @Req() req: Request,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(retentionRecordCreateSchema)) body: any,
  ) {
    return {
      data: await this.retention.registerRecord(
        getAuthenticatedUser(req),
        body,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post("legal-holds")
  @RequirePermissions(Permission.RETENTION_MANAGE)
  async createLegalHold(
    @Req() req: Request,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(legalHoldCreateSchema)) body: any,
  ) {
    return {
      data: await this.retention.createLegalHold(
        getAuthenticatedUser(req),
        body,
        this.idempotencyKey(key),
      ),
    };
  }
  @Get("legal-holds")
  @RequirePermissions(Permission.RETENTION_READ)
  async listLegalHolds(
    @Req() req: Request,
    @Query(new ZodValidationPipe(legalHoldListSchema)) query: any,
  ) {
    return {
      data: await this.retention.listLegalHolds(
        getAuthenticatedUser(req),
        query,
      ),
    };
  }
  @Post("legal-holds/:id/release")
  @HttpCode(200)
  @RequirePermissions(Permission.RETENTION_MANAGE)
  async releaseLegalHold(
    @Req() req: Request,
    @Param("id") holdId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(legalHoldReleaseSchema)) body: any,
  ) {
    return {
      data: await this.retention.releaseLegalHold(
        getAuthenticatedUser(req),
        holdId,
        body.motivo,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post("requests/me")
  @RequirePermissions(Permission.RETENTION_REQUEST)
  async createMyRequest(
    @Req() req: Request,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(suppressionRequestCreateSchema)) body: any,
  ) {
    return {
      data: await this.retention.createRequest(
        getAuthenticatedUser(req),
        body.motivo,
        this.idempotencyKey(key),
      ),
    };
  }
  @Get("requests/me")
  @RequirePermissions(Permission.RETENTION_REQUEST)
  async myRequests(@Req() req: Request) {
    return { data: await this.retention.myRequests(getAuthenticatedUser(req)) };
  }
  @Get("requests")
  @RequirePermissions(Permission.RETENTION_READ)
  async listRequests(
    @Req() req: Request,
    @Query(new ZodValidationPipe(suppressionRequestListSchema)) query: any,
  ) {
    return {
      data: await this.retention.listRequests(getAuthenticatedUser(req), query),
    };
  }
  @Post("requests/:id/resolve")
  @HttpCode(200)
  @RequirePermissions(Permission.RETENTION_MANAGE)
  async resolveRequest(
    @Req() req: Request,
    @Param("id") requestId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(suppressionRequestResolveSchema)) body: any,
  ) {
    return {
      data: await this.retention.resolveRequest(
        getAuthenticatedUser(req),
        requestId,
        body,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post("batches")
  @RequirePermissions(Permission.RETENTION_MANAGE)
  async createBatch(
    @Req() req: Request,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(suppressionBatchCreateSchema)) body: any,
  ) {
    return {
      data: await this.retention.createBatch(
        getAuthenticatedUser(req),
        body,
        this.idempotencyKey(key),
      ),
    };
  }
  @Get("batches")
  @RequirePermissions(Permission.RETENTION_READ)
  async listBatches(
    @Req() req: Request,
    @Query(new ZodValidationPipe(suppressionBatchListSchema)) query: any,
  ) {
    return {
      data: await this.retention.listBatches(getAuthenticatedUser(req), query),
    };
  }
  @Get("batches/:id")
  @RequirePermissions(Permission.RETENTION_READ)
  async batchDetail(@Req() req: Request, @Param("id") batchId: string) {
    return {
      data: await this.retention.batchDetail(
        getAuthenticatedUser(req),
        batchId,
      ),
    };
  }
  @Post("batches/:id/authorize")
  @HttpCode(200)
  @RequirePermissions(Permission.RETENTION_EXECUTE)
  async authorizeBatch(
    @Req() req: Request,
    @Param("id") batchId: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return {
      data: await this.retention.authorizeBatch(
        getAuthenticatedUser(req),
        batchId,
        this.idempotencyKey(key),
      ),
    };
  }
  @Post("batches/:id/pause")
  @HttpCode(200)
  @RequirePermissions(Permission.RETENTION_EXECUTE)
  async pauseBatch(
    @Req() req: Request,
    @Param("id") batchId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(suppressionReasonSchema)) body: any,
  ) {
    return {
      data: await this.retention.pauseBatch(
        getAuthenticatedUser(req),
        batchId,
        body.motivo,
        this.idempotencyKey(key),
      ),
    };
  }
  @Post("batches/:id/execute")
  @HttpCode(200)
  @RequirePermissions(Permission.RETENTION_EXECUTE)
  async executeBatch(
    @Req() req: Request,
    @Param("id") batchId: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return {
      data: await this.retention.executeBatch(
        getAuthenticatedUser(req),
        batchId,
        this.idempotencyKey(key),
      ),
    };
  }
  @Post("batches/:id/retry")
  @HttpCode(200)
  @RequirePermissions(Permission.RETENTION_EXECUTE)
  async retryBatch(
    @Req() req: Request,
    @Param("id") batchId: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return {
      data: await this.retention.retryBatch(
        getAuthenticatedUser(req),
        batchId,
        this.idempotencyKey(key),
      ),
    };
  }

  @Get("suppression-registry")
  @RequirePermissions(Permission.RETENTION_READ)
  async listRegistry(
    @Req() req: Request,
    @Query(new ZodValidationPipe(suppressionRegistryListSchema)) query: any,
  ) {
    return {
      data: await this.retention.listRegistry(getAuthenticatedUser(req), query),
    };
  }
  @Post("suppression-registry/reapply")
  @RequirePermissions(Permission.RETENTION_EXECUTE)
  async reapply(
    @Req() req: Request,
    @Headers("idempotency-key") key: string | undefined,
    @Query(
      "limit",
      new ZodValidationPipe(
        z.coerce.number().int().min(1).max(100).default(100),
      ),
    )
    limit = 100,
  ) {
    return {
      data: await this.retention.reapplySuppressed(
        getAuthenticatedUser(req),
        limit,
        this.idempotencyKey(key),
      ),
    };
  }
}
