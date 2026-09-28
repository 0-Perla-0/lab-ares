import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AuthUser } from "../auth/auth-user";
import { AuditService } from "../auth/audit.service";
import { ApiException } from "../common/errors/api.exception";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { HealthService } from "../health/health.service";
import { AuditQueryService } from "../operations/audit-query.service";
import { RetentionService } from "../retention/retention.service";
import { StorageReconciler } from "../storage/storage.reconciler";
import { readWriteBarrier } from "./barrier";
import {
  journalHash,
  type JournalEnvelope,
  verifyJournalEnvelope,
} from "./journal-integrity";
import type {
  CreateRecoveryRunInput,
  JournalEnvelopeInput,
  RecordRestoreInput,
  RecoveryListInput,
} from "./recovery.schemas";

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const RUN_INCLUDE = {
  steps: { orderBy: { createdAt: "asc" as const } },
  checks: { orderBy: { checkedAt: "asc" as const } },
  reconciliations: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      mode: true,
      state: true,
      attempts: true,
      result: true,
      errorCode: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  },
  importedSuppressions: {
    orderBy: { occurredAt: "asc" as const },
    select: {
      id: true,
      journalEntryId: true,
      payloadHash: true,
      occurredAt: true,
      verifiedAt: true,
      reappliedAt: true,
      resultCode: true,
    },
  },
} as const;

function api(code: string, status = HttpStatus.CONFLICT, details?: unknown) {
  return new ApiException(code, status, details);
}

@Injectable()
export class RecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auditQuery: AuditQueryService,
    private readonly storageReconciler: StorageReconciler,
    private readonly retention: RetentionService,
    private readonly health: HealthService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async status() {
    const barrier = await readWriteBarrier(this.prisma);
    const run = barrier.runId
      ? await this.prisma.recoveryRun.findUnique({
          where: { id: barrier.runId },
          select: { id: true, scope: true, state: true, updatedAt: true },
        })
      : null;
    return { barrier, run };
  }

  async list(input: RecoveryListInput) {
    const where = { state: input.state, scope: input.scope };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.recoveryRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.recoveryRun.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async detail(id: string) {
    const run = await this.prisma.recoveryRun.findUnique({
      where: { id },
      include: RUN_INCLUDE,
    });
    if (!run) throw api("RECOVERY_RUN_NOT_FOUND", 404);
    return run;
  }

  async create(actor: AuthUser, input: CreateRecoveryRunInput, key: string) {
    return this.mutate(actor, key, "CREATE", null, input, async (tx) => {
      const target =
        input.scope === "IMPORTANTE"
          ? { rpoTargetMinutes: 60, rtoTargetMinutes: 480 }
          : { rpoTargetMinutes: 1440, rtoTargetMinutes: 480 };
      const run = await tx.recoveryRun.create({
        data: {
          ...input,
          ...target,
          createdById: actor.id,
          steps: {
            create: {
              type: "PLAN",
              state: "SUCCEEDED",
              actorId: actor.id,
              startedAt: new Date(),
              completedAt: new Date(),
            },
          },
        },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          actorRole: actor.rol,
          action: "RECOVERY_PLAN_CREATED",
          resource: "recovery",
          module: "RECOVERY",
          objectType: "RECOVERY_RUN",
          objectId: run.id,
          metadata: { scope: run.scope, isDrill: run.isDrill },
        },
        tx,
      );
      return run;
    });
  }

  async freeze(actor: AuthUser, id: string, reasonCode: string, key: string) {
    return this.mutate(actor, key, "FREEZE", id, { reasonCode }, async (tx) => {
      await this.lockRun(tx, id);
      const run = await this.runInState(tx, id, ["PLANNED", "FROZEN"]);
      await tx.$executeRaw`SELECT id FROM RecoveryWriteBarrier WHERE id=${"global"} FOR UPDATE`;
      const barrier = await tx.recoveryWriteBarrier.findUnique({
        where: { id: "global" },
      });
      if (!barrier) throw api("RECOVERY_BARRIER_UNAVAILABLE", 503);
      if (barrier.active && barrier.runId !== id)
        throw api("RECOVERY_BARRIER_OWNED_BY_ANOTHER_RUN");
      if (run.state === "FROZEN" && barrier.active)
        return this.safeBarrier(barrier);
      const now = new Date();
      const frozen = await tx.recoveryWriteBarrier.update({
        where: { id: "global" },
        data: {
          active: true,
          runId: id,
          version: { increment: 1 },
          reasonCode,
          snapshotAt: now,
          frozenAt: now,
          frozenById: actor.id,
          unfrozenAt: null,
          unfrozenById: null,
        },
      });
      await tx.recoveryRun.update({
        where: { id },
        data: { state: "FROZEN", frozenAt: now, frozenById: actor.id },
      });
      await this.step(tx, id, "FREEZE", actor.id, { version: frozen.version });
      await this.auditEvent(tx, actor, id, "RECOVERY_FROZEN", {
        version: frozen.version,
        reasonCode,
      });
      return this.safeBarrier(frozen);
    });
  }

  async recordRestore(
    actor: AuthUser,
    id: string,
    input: RecordRestoreInput,
    key: string,
  ) {
    return this.mutate(actor, key, "RECORD_RESTORE", id, input, async (tx) => {
      await this.lockRun(tx, id);
      const run = await this.runInState(tx, id, ["FROZEN"]);
      const barrier = await tx.recoveryWriteBarrier.findUnique({
        where: { id: "global" },
      });
      if (!barrier?.active || barrier.runId !== id)
        throw api("RECOVERY_BARRIER_LOST", 503);
      if (!run.frozenAt || input.restorePoint >= run.frozenAt)
        throw api("RECOVERY_RESTORE_POINT_INVALID");
      const now = new Date();
      const updated = await tx.recoveryRun.update({
        where: { id },
        data: {
          state: "RESTORE_RECORDED",
          restorePoint: input.restorePoint,
          imageVersion: input.imageVersion,
          externalProviderRef: input.externalProviderRef,
          actualRpoMinutes: input.actualRpoMinutes,
          actualRtoMinutes: input.actualRtoMinutes,
          restoreRecordedAt: now,
        },
      });
      await this.step(tx, id, "RESTORE_RECORD", actor.id, {
        imageVersion: input.imageVersion,
      });
      await this.auditEvent(tx, actor, id, "RECOVERY_RESTORE_RECORDED", {
        restorePoint: input.restorePoint.toISOString(),
        imageVersion: input.imageVersion,
      });
      return updated;
    });
  }

  async preview(actor: AuthUser, id: string, limit: number, key: string) {
    await this.assertState(id, [
      "RESTORE_RECORDED",
      "RECONCILIATION_PREVIEWED",
    ]);
    const existing = await this.reconciliationReplay(
      id,
      "PREVIEW",
      key,
      actor.id,
    );
    if (existing) return existing;
    await this.assertOwningBarrier(id);
    const execution = await this.prisma.recoveryReconciliationRun.create({
      data: {
        runId: id,
        mode: "PREVIEW",
        state: "RUNNING",
        idempotencyKey: key,
        requestedById: actor.id,
        attempts: 1,
        maxAttempts: this.config.get("RECOVERY_RECONCILIATION_MAX_ATTEMPTS"),
        leaseOwner: `user:${actor.id}`,
        leaseUntil: new Date(
          Date.now() + this.config.get("RECOVERY_RECONCILIATION_LEASE_MS"),
        ),
        startedAt: new Date(),
      },
    });
    try {
      const result = await this.storageReconciler.preview(limit);
      if (!result.planHash) throw api("RECOVERY_RECONCILIATION_BUSY");
      await this.prisma.$transaction(async (tx) => {
        await tx.recoveryReconciliationRun.update({
          where: { id: execution.id },
          data: {
            state: "SUCCEEDED",
            result: this.json({ ...result, limit }),
            leaseOwner: null,
            leaseUntil: null,
            completedAt: new Date(),
          },
        });
        await tx.recoveryRun.update({
          where: { id },
          data: { state: "RECONCILIATION_PREVIEWED", previewedAt: new Date() },
        });
        await this.step(tx, id, "RECONCILIATION_PREVIEW", actor.id, result);
        await this.auditEvent(
          tx,
          actor,
          id,
          "RECOVERY_RECONCILIATION_PREVIEWED",
          {
            proposed: result.proposed,
            planHash: result.planHash,
          },
        );
      });
      return result;
    } catch (error) {
      await this.failReconciliation(execution.id, error);
      throw error;
    }
  }

  async reconcile(actor: AuthUser, id: string, limit: number, key: string) {
    const existing = await this.reconciliationReplay(
      id,
      "EXECUTE",
      key,
      actor.id,
    );
    if (existing) return existing;
    await this.assertState(id, ["RECONCILIATION_PREVIEWED"]);
    const preview = await this.prisma.recoveryReconciliationRun.findFirst({
      where: { runId: id, mode: "PREVIEW", state: "SUCCEEDED" },
      orderBy: { completedAt: "desc" },
    });
    const previewResult = preview?.result as
      { planHash?: string; limit?: number } | undefined;
    if (!previewResult?.planHash) throw api("RECOVERY_PREVIEW_REQUIRED");
    if (previewResult.limit !== limit)
      throw api("RECOVERY_PREVIEW_LIMIT_MISMATCH");
    const barrier = await readWriteBarrier(this.prisma);
    if (!barrier.active || barrier.runId !== id)
      throw api("RECOVERY_BARRIER_LOST", 503);
    const execution = await this.prisma.recoveryReconciliationRun.create({
      data: {
        runId: id,
        mode: "EXECUTE",
        state: "RUNNING",
        idempotencyKey: key,
        requestedById: actor.id,
        attempts: 1,
        maxAttempts: this.config.get("RECOVERY_RECONCILIATION_MAX_ATTEMPTS"),
        leaseOwner: `user:${actor.id}`,
        leaseUntil: new Date(
          Date.now() + this.config.get("RECOVERY_RECONCILIATION_LEASE_MS"),
        ),
        startedAt: new Date(),
      },
    });
    try {
      const result = await this.storageReconciler.execute(
        limit,
        previewResult.planHash,
        id,
        barrier.version,
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.recoveryReconciliationRun.update({
          where: { id: execution.id },
          data: {
            state: "SUCCEEDED",
            result: this.json(result),
            leaseOwner: null,
            leaseUntil: null,
            completedAt: new Date(),
          },
        });
        await tx.recoveryRun.update({
          where: { id },
          data: { state: "RECONCILED", reconciledAt: new Date() },
        });
        await this.step(tx, id, "RECONCILIATION_EXECUTE", actor.id, result);
        await tx.recoveryCheck.create({
          data: {
            runId: id,
            type: "STORAGE",
            passed: true,
            code: "RECONCILIATION_APPLIED",
            summary: this.json({ repaired: result.repaired }),
            checkedById: actor.id,
          },
        });
        await this.auditEvent(tx, actor, id, "RECOVERY_RECONCILED", {
          repaired: result.repaired,
          planHash: result.planHash,
        });
      });
      return result;
    } catch (error) {
      await this.failReconciliation(execution.id, error);
      throw error;
    }
  }

  async verifyAudit(
    actor: AuthUser,
    id: string,
    period: string | undefined,
    key: string,
  ) {
    const replay = await this.mutationReplay(actor, key, "VERIFY_AUDIT", id, {
      period,
    });
    if (replay) return replay;
    await this.assertOwningBarrier(id);
    return this.mutate(
      actor,
      key,
      "VERIFY_AUDIT",
      id,
      { period },
      async (tx) => {
        const run = await this.runInState(tx, id, ["RECONCILED"]);
        const effectivePeriod =
          period ?? run.restorePoint?.toISOString().slice(0, 10);
        if (!effectivePeriod) throw api("RECOVERY_RESTORE_POINT_REQUIRED");
        const result = await this.auditQuery.verifyManifest(
          actor,
          effectivePeriod,
        );
        await tx.recoveryCheck.create({
          data: {
            runId: id,
            type: "AUDIT_INTEGRITY",
            passed: result.valid,
            code: result.valid ? "AUDIT_VALID" : "AUDIT_INVALID",
            summary: this.json({
              period: effectivePeriod,
              issueCount: result.issues.length,
            }),
            checkedById: actor.id,
          },
        });
        if (!result.valid)
          throw api("RECOVERY_AUDIT_INTEGRITY_FAILED", 409, {
            issueCount: result.issues.length,
          });
        await tx.recoveryRun.update({
          where: { id },
          data: { state: "AUDIT_VERIFIED", auditVerifiedAt: new Date() },
        });
        await this.step(tx, id, "AUDIT_VERIFY", actor.id, {
          period: effectivePeriod,
        });
        await this.auditEvent(tx, actor, id, "RECOVERY_AUDIT_VERIFIED", {
          period: effectivePeriod,
        });
        return result;
      },
    );
  }

  async importJournal(
    actor: AuthUser,
    id: string,
    entries: JournalEnvelopeInput[],
    key: string,
  ) {
    const sorted = [...entries].sort(
      (left, right) => left.sequence - right.sequence,
    );
    const request = {
      entries: sorted.map((entry) => ({
        entryId: entry.entryId,
        payloadHash: entry.payloadHash,
        entryHash: entry.entryHash,
        signature: entry.signature,
      })),
    };
    const replay = await this.mutationReplay<{
      imported: number;
      verified: boolean;
    }>(actor, key, "IMPORT_JOURNAL", id, request);
    if (replay) return replay;
    await this.assertOwningBarrier(id);
    const run = await this.assertState(id, ["AUDIT_VERIFIED"]);
    const restorePoint = run.restorePoint;
    if (!restorePoint) throw api("RECOVERY_RESTORE_POINT_REQUIRED");
    const secret = this.config.get("SUPPRESSION_JOURNAL_HMAC_SECRET");
    const keyVersion = this.config.get("SUPPRESSION_JOURNAL_KEY_VERSION");
    let previous: string | null = null;
    for (const [index, entry] of sorted.entries()) {
      if (entry.keyVersion !== keyVersion)
        throw api("RECOVERY_JOURNAL_KEY_VERSION_UNKNOWN");
      if (new Date(entry.occurredAt) <= restorePoint)
        throw api("RECOVERY_JOURNAL_ENTRY_BEFORE_RESTORE_POINT");
      if (index > 0 && entry.sequence !== sorted[index - 1].sequence + 1)
        throw api("RECOVERY_JOURNAL_SEQUENCE_GAP");
      if (index > 0 && entry.previousHash !== previous)
        throw api("RECOVERY_JOURNAL_CHAIN_INVALID");
      const payloadHash = journalHash(entry.payload);
      const entryHash = journalHash({
        entryId: entry.entryId,
        sequence: entry.sequence,
        previousHash: entry.previousHash,
        payloadHash,
        occurredAt: entry.occurredAt,
      });
      if (payloadHash !== entry.payloadHash || entryHash !== entry.entryHash)
        throw api("RECOVERY_JOURNAL_HASH_INVALID");
      const { signature, ...unsigned } = entry;
      const envelope = unsigned as JournalEnvelope;
      if (!verifyJournalEnvelope(envelope, signature, secret))
        throw api("RECOVERY_JOURNAL_SIGNATURE_INVALID");
      previous = entry.entryHash;
    }
    return this.mutate(
      actor,
      key,
      "IMPORT_JOURNAL",
      id,
      request,
      async (tx) => {
        for (const entry of sorted)
          await tx.recoveryImportedSuppression.upsert({
            where: {
              runId_journalEntryId: {
                runId: id,
                journalEntryId: entry.entryId,
              },
            },
            create: {
              runId: id,
              journalEntryId: entry.entryId,
              payloadHash: entry.payloadHash,
              signature: entry.signature,
              payload: this.json(entry.payload),
              occurredAt: new Date(entry.occurredAt),
              verifiedAt: new Date(),
            },
            update: {},
          });
        await tx.recoveryCheck.create({
          data: {
            runId: id,
            type: "JOURNAL_INTEGRITY",
            passed: true,
            code: "JOURNAL_VERIFIED",
            summary: this.json({ count: sorted.length }),
            checkedById: actor.id,
          },
        });
        await tx.recoveryRun.update({
          where: { id },
          data: { state: "JOURNAL_IMPORTED", journalImportedAt: new Date() },
        });
        await this.step(tx, id, "JOURNAL_IMPORT", actor.id, {
          count: sorted.length,
        });
        await this.auditEvent(tx, actor, id, "RECOVERY_JOURNAL_IMPORTED", {
          count: sorted.length,
        });
        return { imported: sorted.length, verified: true };
      },
    );
  }

  async reapply(actor: AuthUser, id: string, limit: number, key: string) {
    const replay = await this.mutationReplay<{
      reapplied: number;
      failed: number;
    }>(actor, key, "REAPPLY_SUPPRESSIONS", id, { limit });
    if (replay) return replay;
    await this.assertOwningBarrier(id);
    await this.assertState(id, ["JOURNAL_IMPORTED"]);
    const imported = await this.prisma.recoveryImportedSuppression.findMany({
      where: { runId: id, reappliedAt: null },
      orderBy: { occurredAt: "asc" },
      take: limit,
    });
    const result = await this.retention.reapplyImportedJournal(actor, imported);
    return this.mutate(
      actor,
      key,
      "REAPPLY_SUPPRESSIONS",
      id,
      { limit },
      async (tx) => {
        if (result.failed > 0)
          throw api("RECOVERY_SUPPRESSION_REAPPLY_FAILED", 409, {
            failed: result.failed,
          });
        await tx.recoveryImportedSuppression.updateMany({
          where: { runId: id, id: { in: result.reappliedIds } },
          data: { reappliedAt: new Date(), resultCode: "REAPPLIED" },
        });
        for (const match of result.matches)
          await tx.recoveryImportedSuppression.update({
            where: { id: match.importedId },
            data: { matchedRegistroId: match.registroId },
          });
        await tx.recoveryRun.update({
          where: { id },
          data: {
            state: "SUPPRESSIONS_REAPPLIED",
            suppressionsReappliedAt: new Date(),
          },
        });
        await this.step(tx, id, "SUPPRESSION_REAPPLY", actor.id, {
          reapplied: result.reapplied,
        });
        await this.auditEvent(
          tx,
          actor,
          id,
          "RECOVERY_SUPPRESSIONS_REAPPLIED",
          {
            reapplied: result.reapplied,
          },
        );
        return { reapplied: result.reapplied, failed: 0 };
      },
    );
  }

  async approve(actor: AuthUser, id: string, key: string) {
    const replay = await this.mutationReplay(
      actor,
      key,
      "APPROVE_READY",
      id,
      {},
    );
    if (replay) return replay;
    await this.assertOwningBarrier(id);
    const run = await this.assertState(id, ["SUPPRESSIONS_REAPPLIED"]);
    if (actor.id === run.frozenById || actor.id === run.responsibleId)
      throw api("RECOVERY_SEPARATION_OF_DUTIES_REQUIRED", 403);
    const dependencies = await this.health.dependencies();
    const [outboxInFlight, journalUnresolved] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { state: "PROCESSING" } }),
      this.prisma.suppressionJournalEntry.count({
        where: { state: { in: ["PENDING", "PROCESSING", "FAILED"] } },
      }),
    ]);
    const checks = [
      [
        "DATABASE",
        dependencies.database === "connected",
        dependencies.database,
      ],
      ["STORAGE", dependencies.storage === "connected", dependencies.storage],
      [
        "SCANNER",
        dependencies.scanner !== "disconnected",
        dependencies.scanner,
      ],
      [
        "OUTBOX",
        outboxInFlight === 0,
        outboxInFlight ? "OUTBOX_IN_FLIGHT" : "OUTBOX_DRAINED",
      ],
      [
        "JOURNAL_INTEGRITY",
        journalUnresolved === 0,
        journalUnresolved ? "JOURNAL_UNRESOLVED" : "JOURNAL_EXPORTED",
      ],
    ] as const;
    if (checks.some(([, passed]) => !passed))
      throw api("RECOVERY_READINESS_FAILED", 409, {
        failed: checks
          .filter(([, passed]) => !passed)
          .map(([type, , code]) => ({ type, code })),
      });
    return this.mutate(actor, key, "APPROVE_READY", id, {}, async (tx) => {
      for (const [type, passed, code] of checks)
        await tx.recoveryCheck.create({
          data: {
            runId: id,
            type,
            passed,
            code: String(code).toUpperCase(),
            checkedById: actor.id,
          },
        });
      await tx.recoveryCheck.create({
        data: {
          runId: id,
          type: "READINESS",
          passed: true,
          code: "READY_APPROVED",
          checkedById: actor.id,
        },
      });
      const updated = await tx.recoveryRun.update({
        where: { id },
        data: {
          state: "READY_APPROVED",
          readyApprovedById: actor.id,
          readyApprovedAt: new Date(),
        },
      });
      await this.step(tx, id, "READY_APPROVAL", actor.id, { ready: true });
      await this.auditEvent(tx, actor, id, "RECOVERY_READY_APPROVED", {
        checkCount: checks.length + 1,
      });
      return updated;
    });
  }

  async unfreeze(actor: AuthUser, id: string, key: string) {
    return this.mutate(actor, key, "UNFREEZE", id, {}, async (tx) => {
      await this.lockRun(tx, id);
      const run = await this.runInState(tx, id, ["READY_APPROVED"]);
      if (actor.id === run.frozenById)
        throw api("RECOVERY_SEPARATION_OF_DUTIES_REQUIRED", 403);
      await tx.$executeRaw`SELECT id FROM RecoveryWriteBarrier WHERE id=${"global"} FOR UPDATE`;
      const barrier = await tx.recoveryWriteBarrier.findUnique({
        where: { id: "global" },
      });
      if (!barrier?.active || barrier.runId !== id)
        throw api("RECOVERY_BARRIER_LOST", 503);
      const released = await tx.recoveryWriteBarrier.update({
        where: { id: "global" },
        data: {
          active: false,
          runId: null,
          version: { increment: 1 },
          unfrozenAt: new Date(),
          unfrozenById: actor.id,
        },
      });
      await this.step(tx, id, "UNFREEZE", actor.id, {
        version: released.version,
      });
      await this.auditEvent(tx, actor, id, "RECOVERY_UNFROZEN", {
        version: released.version,
      });
      return this.safeBarrier(released);
    });
  }

  async complete(
    actor: AuthUser,
    id: string,
    input: { drillResult?: string; drillNotes?: string },
    key: string,
  ) {
    return this.mutate(actor, key, "COMPLETE", id, input, async (tx) => {
      const run = await this.runInState(tx, id, ["READY_APPROVED"]);
      const barrier = await tx.recoveryWriteBarrier.findUnique({
        where: { id: "global" },
      });
      if (barrier?.active) throw api("RECOVERY_UNFREEZE_REQUIRED");
      if (run.isDrill && !input.drillResult)
        throw api("RECOVERY_DRILL_RESULT_REQUIRED");
      const updated = await tx.recoveryRun.update({
        where: { id },
        data: {
          state: "COMPLETED",
          completedAt: new Date(),
          completedById: actor.id,
          drillResult: input.drillResult as never,
          drillNotes: input.drillNotes,
        },
      });
      await this.step(tx, id, "COMPLETE", actor.id, { completed: true });
      await this.auditEvent(tx, actor, id, "RECOVERY_COMPLETED", {
        isDrill: run.isDrill,
        drillResult: input.drillResult,
      });
      return updated;
    });
  }

  async terminate(
    actor: AuthUser,
    id: string,
    action: "FAIL" | "CANCEL",
    reason: string,
    key: string,
  ) {
    return this.mutate(actor, key, action, id, { reason }, async (tx) => {
      const run = await tx.recoveryRun.findUnique({ where: { id } });
      if (!run) throw api("RECOVERY_RUN_NOT_FOUND", 404);
      if (TERMINAL.has(run.state)) return run;
      const now = new Date();
      const updated = await tx.recoveryRun.update({
        where: { id },
        data:
          action === "FAIL"
            ? { state: "FAILED", failedAt: now, failedById: actor.id }
            : { state: "CANCELLED", cancelledAt: now, cancelledById: actor.id },
      });
      await this.step(tx, id, action, actor.id, { reason }, "FAILED");
      await this.auditEvent(tx, actor, id, `RECOVERY_${action}ED`, { reason });
      return updated;
    });
  }

  async drills() {
    return this.prisma.recoveryRun.findMany({
      where: { isDrill: true },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        scope: true,
        state: true,
        rpoTargetMinutes: true,
        rtoTargetMinutes: true,
        actualRpoMinutes: true,
        actualRtoMinutes: true,
        drillResult: true,
        drillNotes: true,
        completedAt: true,
      },
    });
  }

  private async mutate<T>(
    actor: AuthUser,
    key: string,
    action: string,
    runId: string | null,
    request: unknown,
    execute: (tx: any) => Promise<T>,
  ): Promise<T> {
    const requestHash = journalHash({ action, runId, request });
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.recoveryOperation.findUnique({
        where: { actorId_key: { actorId: actor.id, key } },
      });
      if (existing) {
        if (existing.action !== action || existing.requestHash !== requestHash)
          throw api("IDEMPOTENCY_KEY_REUSED");
        if (existing.response == null)
          throw api("RECOVERY_OPERATION_INCOMPLETE");
        return existing.response as T;
      }
      const operation = await tx.recoveryOperation.create({
        data: { actorId: actor.id, key, action, requestHash, runId },
      });
      const result = await execute(tx);
      await tx.recoveryOperation.update({
        where: { id: operation.id },
        data: { response: this.json(result) as never },
      });
      return result;
    });
  }

  private async mutationReplay<T>(
    actor: AuthUser,
    key: string,
    action: string,
    runId: string | null,
    request: unknown,
  ): Promise<T | undefined> {
    const existing = await this.prisma.recoveryOperation.findUnique({
      where: { actorId_key: { actorId: actor.id, key } },
    });
    if (!existing) return undefined;
    const requestHash = journalHash({ action, runId, request });
    if (existing.action !== action || existing.requestHash !== requestHash)
      throw api("IDEMPOTENCY_KEY_REUSED");
    if (existing.response == null) throw api("RECOVERY_OPERATION_INCOMPLETE");
    return existing.response as T;
  }

  private async reconciliationReplay(
    runId: string,
    mode: "PREVIEW" | "EXECUTE",
    key: string,
    actorId: number,
  ) {
    const existing = await this.prisma.recoveryReconciliationRun.findUnique({
      where: { idempotencyKey: key },
    });
    if (!existing) return null;
    if (
      existing.runId !== runId ||
      existing.mode !== mode ||
      existing.requestedById !== actorId
    )
      throw api("IDEMPOTENCY_KEY_REUSED");
    if (existing.state === "SUCCEEDED") return existing.result;
    if (
      existing.state === "RUNNING" &&
      existing.leaseUntil &&
      existing.leaseUntil > new Date()
    )
      throw api("RECOVERY_RECONCILIATION_IN_PROGRESS");
    throw api("RECOVERY_RECONCILIATION_RETRY_REQUIRED");
  }

  private async failReconciliation(id: string, error: unknown) {
    const code =
      error instanceof ApiException
        ? error.code
        : error instanceof Error
          ? error.message.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 100)
          : "RECONCILIATION_FAILED";
    await this.prisma.recoveryReconciliationRun.updateMany({
      where: { id, state: "RUNNING" },
      data: {
        state: "FAILED",
        errorCode: code || "RECONCILIATION_FAILED",
        leaseOwner: null,
        leaseUntil: null,
        completedAt: new Date(),
      },
    });
  }

  private async assertState(id: string, states: string[]) {
    const run = await this.prisma.recoveryRun.findUnique({ where: { id } });
    if (!run) throw api("RECOVERY_RUN_NOT_FOUND", 404);
    if (!states.includes(run.state)) throw api("RECOVERY_STATE_INVALID");
    return run;
  }

  private async assertOwningBarrier(id: string) {
    const barrier = await readWriteBarrier(this.prisma);
    if (!barrier.active || barrier.runId !== id)
      throw api("RECOVERY_BARRIER_LOST", 503);
    return barrier;
  }

  private async runInState(tx: any, id: string, states: string[]) {
    const run = await tx.recoveryRun.findUnique({ where: { id } });
    if (!run) throw api("RECOVERY_RUN_NOT_FOUND", 404);
    if (!states.includes(run.state)) throw api("RECOVERY_STATE_INVALID");
    return run;
  }

  private lockRun(tx: any, id: string) {
    return tx.$executeRaw`SELECT id FROM RecoveryRun WHERE id=${id} FOR UPDATE`;
  }

  private step(
    tx: any,
    runId: string,
    type: string,
    actorId: number,
    summary: unknown,
    state = "SUCCEEDED",
  ) {
    const now = new Date();
    return tx.recoveryStep.create({
      data: {
        runId,
        type,
        state,
        actorId,
        summary: this.json(summary),
        startedAt: now,
        completedAt: now,
      },
    });
  }

  private auditEvent(
    tx: any,
    actor: AuthUser,
    runId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.append(
      {
        actorId: actor.id,
        actorRole: actor.rol,
        action,
        resource: "recovery",
        module: "RECOVERY",
        objectType: "RECOVERY_RUN",
        objectId: runId,
        metadata,
      },
      tx,
    );
  }

  private safeBarrier(barrier: any) {
    return {
      active: barrier.active,
      runId: barrier.runId,
      version: barrier.version,
      frozenAt: barrier.frozenAt,
      snapshotAt: barrier.snapshotAt,
      unfrozenAt: barrier.unfrozenAt,
    };
  }

  private json<T>(value: T) {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
