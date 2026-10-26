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

const cleanupListSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const cleanupCandidatesSchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
  .strict();
const cleanupObjectSchema = z
  .object({
    kind: z.enum(["ORPHAN_OBJECT", "QUARANTINE_COPY"]),
    bucket: z.enum(["quarantine", "available"]),
    key: z.string().min(1).max(500),
  })
  .strict();

@Controller("retention")
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}
  @Get("adapters")
  @RequirePermissions(Permission.RETENTION_READ)
  adapters(@Req() req: Request) {
    return { data: this.retention.adapters(getAuthenticatedUser(req)) };
  }

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

  @Get("object-deletions")
  @RequirePermissions(Permission.RETENTION_READ)
  async objectDeletions(
    @Req() req: Request,
    @Query(
      new ZodValidationPipe(
        z
          .object({
            page: z.coerce.number().int().min(1).max(10000).default(1),
            pageSize: z.coerce.number().int().min(1).max(100).default(20),
          })
          .strict(),
      ),
    )
    query: { page: number; pageSize: number },
  ) {
    return {
      data: await this.retention.listObjectDeletions(
        getAuthenticatedUser(req),
        query.page,
        query.pageSize,
      ),
    };
  }
  @Post("object-deletions/:id/reconcile")
  @RequirePermissions(Permission.RETENTION_EXECUTE)
  async reconcileObject(
    @Req() req: Request,
    @Param("id", new ZodValidationPipe(z.string().regex(/^c[a-z0-9]{20,30}$/)))
    id: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return {
      data: await this.retention.reconcileObjectDeletion(
        getAuthenticatedUser(req),
        id,
        this.idempotencyKey(key),
      ),
    };
  }
  @Get("object-cleanup")
  @RequirePermissions(Permission.RETENTION_READ)
  async objectCleanups(
    @Req() req: Request,
    @Query(new ZodValidationPipe(cleanupListSchema))
    query: { page: number; pageSize: number },
  ) {
    return {
      data: await this.retention.listObjectCleanups(
        getAuthenticatedUser(req),
        query.page,
        query.pageSize,
      ),
    };
  }
  @Get("object-cleanup/candidates")
  @RequirePermissions(Permission.RETENTION_EXECUTE)
  async objectCleanupCandidates(
    @Req() req: Request,
    @Query(new ZodValidationPipe(cleanupCandidatesSchema))
    query: { limit: number },
  ) {
    return {
      data: await this.retention.objectCleanupCandidates(
        getAuthenticatedUser(req),
        query.limit,
      ),
    };
  }
  @Post("object-cleanup")
  @HttpCode(200)
  @RequirePermissions(Permission.RETENTION_EXECUTE)
  async objectCleanup(
    @Req() req: Request,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(cleanupObjectSchema))
    body: z.infer<typeof cleanupObjectSchema>,
  ) {
    return {
      data: await this.retention.cleanupObject(
        getAuthenticatedUser(req),
        this.idempotencyKey(key),
        body,
      ),
    };
  }
  @Post("object-cleanup/:id/reconcile")
  @HttpCode(200)
  @RequirePermissions(Permission.RETENTION_EXECUTE)
  async reconcileCleanup(
    @Req() req: Request,
    @Param("id", new ZodValidationPipe(z.string().regex(/^c[a-z0-9]{20,30}$/)))
    id: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return {
      data: await this.retention.reconcileObjectCleanup(
        getAuthenticatedUser(req),
        id,
        this.idempotencyKey(key),
      ),
    };
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
