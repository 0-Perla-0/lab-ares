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
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ApiException } from "../common/errors/api.exception";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  auditVerifySchema,
  completeRecoverySchema,
  createRecoveryRunSchema,
  freezeRecoverySchema,
  importJournalSchema,
  reasonSchema,
  reconciliationSchema,
  recordRestoreSchema,
  recoveryIdempotencyKeySchema,
  recoveryListSchema,
  reapplySchema,
} from "./recovery.schemas";
import { RecoveryService } from "./recovery.service";

@Controller("recovery")
export class RecoveryController {
  constructor(private readonly recovery: RecoveryService) {}

  private idempotencyKey(value: string | undefined) {
    const parsed = recoveryIdempotencyKeySchema.safeParse(value);
    if (!parsed.success)
      throw new ApiException(
        "VALIDATION_ERROR",
        400,
        z.treeifyError(parsed.error),
      );
    return parsed.data;
  }

  @Get("status")
  @RequirePermissions(Permission.RECOVERY_READ)
  async status() {
    return { data: await this.recovery.status() };
  }

  @Get("drills")
  @RequirePermissions(Permission.RECOVERY_READ)
  async drills() {
    return { data: await this.recovery.drills() };
  }

  @Get()
  @RequirePermissions(Permission.RECOVERY_READ)
  async list(@Query(new ZodValidationPipe(recoveryListSchema)) query: unknown) {
    return { data: await this.recovery.list(query as never) };
  }

  @Get(":id")
  @RequirePermissions(Permission.RECOVERY_READ)
  async detail(@Param("id") id: string) {
    return { data: await this.recovery.detail(id) };
  }

  @Post()
  @RequirePermissions(Permission.RECOVERY_MANAGE)
  async create(
    @Req() request: Request,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(createRecoveryRunSchema)) body: unknown,
  ) {
    return {
      data: await this.recovery.create(
        getAuthenticatedUser(request),
        body as never,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post(":id/freeze")
  @HttpCode(200)
  @RequirePermissions(Permission.RECOVERY_MANAGE)
  async freeze(
    @Req() request: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(freezeRecoverySchema))
    body: { reasonCode: string },
  ) {
    return {
      data: await this.recovery.freeze(
        getAuthenticatedUser(request),
        id,
        body.reasonCode,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post(":id/restore")
  @HttpCode(200)
  @RequirePermissions(Permission.RECOVERY_MANAGE)
  async restore(
    @Req() request: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(recordRestoreSchema)) body: unknown,
  ) {
    return {
      data: await this.recovery.recordRestore(
        getAuthenticatedUser(request),
        id,
        body as never,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post(":id/reconciliation/preview")
  @HttpCode(200)
  @RequirePermissions(Permission.RECOVERY_EXECUTE)
  async preview(
    @Req() request: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(reconciliationSchema)) body: { limit: number },
  ) {
    return {
      data: await this.recovery.preview(
        getAuthenticatedUser(request),
        id,
        body.limit,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post(":id/reconciliation/execute")
  @HttpCode(200)
  @RequirePermissions(Permission.RECOVERY_EXECUTE)
  async reconcile(
    @Req() request: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(reconciliationSchema)) body: { limit: number },
  ) {
    return {
      data: await this.recovery.reconcile(
        getAuthenticatedUser(request),
        id,
        body.limit,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post(":id/audit/verify")
  @HttpCode(200)
  @RequirePermissions(Permission.RECOVERY_EXECUTE)
  async verifyAudit(
    @Req() request: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(auditVerifySchema)) body: { period?: string },
  ) {
    return {
      data: await this.recovery.verifyAudit(
        getAuthenticatedUser(request),
        id,
        body.period,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post(":id/journal/import")
  @HttpCode(200)
  @RequirePermissions(Permission.RECOVERY_EXECUTE)
  async importJournal(
    @Req() request: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(importJournalSchema))
    body: { entries: never[] },
  ) {
    return {
      data: await this.recovery.importJournal(
        getAuthenticatedUser(request),
        id,
        body.entries,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post(":id/suppressions/reapply")
  @HttpCode(200)
  @RequirePermissions(Permission.RECOVERY_EXECUTE)
  async reapply(
    @Req() request: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(reapplySchema)) body: { limit: number },
  ) {
    return {
      data: await this.recovery.reapply(
        getAuthenticatedUser(request),
        id,
        body.limit,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post(":id/approve-ready")
  @HttpCode(200)
  @RequirePermissions(Permission.RECOVERY_MANAGE)
  async approve(
    @Req() request: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return {
      data: await this.recovery.approve(
        getAuthenticatedUser(request),
        id,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post(":id/unfreeze")
  @HttpCode(200)
  @RequirePermissions(Permission.RECOVERY_EXECUTE)
  async unfreeze(
    @Req() request: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return {
      data: await this.recovery.unfreeze(
        getAuthenticatedUser(request),
        id,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post(":id/complete")
  @HttpCode(200)
  @RequirePermissions(Permission.RECOVERY_MANAGE)
  async complete(
    @Req() request: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(completeRecoverySchema)) body: unknown,
  ) {
    return {
      data: await this.recovery.complete(
        getAuthenticatedUser(request),
        id,
        body as never,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post(":id/fail")
  @HttpCode(200)
  @RequirePermissions(Permission.RECOVERY_MANAGE)
  async fail(
    @Req() request: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(reasonSchema)) body: { reason: string },
  ) {
    return {
      data: await this.recovery.terminate(
        getAuthenticatedUser(request),
        id,
        "FAIL",
        body.reason,
        this.idempotencyKey(key),
      ),
    };
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermissions(Permission.RECOVERY_MANAGE)
  async cancel(
    @Req() request: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodValidationPipe(reasonSchema)) body: { reason: string },
  ) {
    return {
      data: await this.recovery.terminate(
        getAuthenticatedUser(request),
        id,
        "CANCEL",
        body.reason,
        this.idempotencyKey(key),
      ),
    };
  }
}
