import { ConfigService } from "@nestjs/config";
import { Injectable, Optional } from "@nestjs/common";
import { DomainTransaction } from "../common/domain/domain-transaction";
import { queueObservability } from "./queue-observability";
import { EmailService } from "../auth/email.service";
import { dateColumn, nextDay } from "../calendar/calendar-time";
import { localParts } from "../attendance/attendance-risk";

import type { AuthUser } from "../auth/auth-user";
import { AuditService } from "../auth/audit.service";
import { ApiException } from "../common/errors/api.exception";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { withWorkerWriteBarrier } from "../common/domain/worker-write-barrier";
import type { Prisma } from "../generated/prisma/client";
import {
  OperationalAlertState,
  OperationalAttemptResult,
  OperationalIncidentState,
  OperationalJobState,
} from "../generated/prisma/enums";
import { HealthService } from "../health/health.service";
import type {
  ClaimJob,
  CompleteJob,
  CreateIncident,
  CreateJob,
  FailJob,
  OperationsList,
  UpdateIncident,
} from "./operations.schemas";

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly health: HealthService,
    private readonly config: ConfigService<Environment, true>,
    @Optional() private readonly transaction?: DomainTransaction,
    @Optional() private readonly email?: EmailService,
  ) {}

  async status() {
    const [
      dependencies,
      jobs,
      alerts,
      incidents,
      smtpConnectivity,
      heartbeats,
    ] = await Promise.all([
      this.health.dependencies(),
      this.prisma.operationalJobExecution.groupBy({
        by: ["state"],
        _count: { _all: true },
      }),
      this.prisma.operationalAlert.count({
        where: { state: { not: OperationalAlertState.RESOLVED } },
      }),
      this.prisma.operationalIncident.count({
        where: {
          state: {
            notIn: [
              OperationalIncidentState.RESUELTO,
              OperationalIncidentState.CERRADO,
            ],
          },
        },
      }),
      this.email?.connectivity() ?? Promise.resolve("not-probed"),
      this.prisma.workerHeartbeat.findMany(),
    ]);
    return {
      dependencies,
      jobs: Object.fromEntries(
        jobs.map((item) => [item.state, item._count._all]),
      ),
      openAlerts: alerts,
      openIncidents: incidents,
      smtp: {
        enabled: this.config.get("SMTP_ENABLED"),
        connectivity: smtpConnectivity,
        deliveryVerified: false,
      },
      workers: {
        outbox: this.config.get("OUTBOX_WORKER_ENABLED"),
        storage: this.config.get("STORAGE_WORKER_ENABLED"),
        attendance: this.config.get("ATTENDANCE_WORKER_ENABLED"),
        absences: this.config.get("ABSENCE_WORKER_ENABLED"),
        reports: this.config.get("REPORTS_WORKER_ENABLED"),
        retention: this.config.get("RETENTION_WORKER_ENABLED"),
        suppressionJournal: this.config.get(
          "SUPPRESSION_JOURNAL_WORKER_ENABLED",
        ),
        auditManifest: this.config.get("AUDIT_MANIFEST_WORKER_ENABLED"),
        inventoryCheck: this.config.get("INVENTORY_CHECK_WORKER_ENABLED"),
        queueMonitor: this.config.get("OPERATIONS_QUEUE_MONITOR_ENABLED"),
      },
      workerHealth: Object.fromEntries(
        heartbeats.map((row) => {
          const interval =
            (
              {
                attendance: 30000,
                absences: 60000,
                identityCleanup: 900000,
                outbox: 5000,
                storage: this.config.get("STORAGE_WORKER_INTERVAL_MS"),
                reports: this.config.get("REPORTS_WORKER_INTERVAL_MS"),
                retention: this.config.get("RETENTION_WORKER_INTERVAL_MS"),
                suppressionJournal: this.config.get(
                  "SUPPRESSION_JOURNAL_WORKER_INTERVAL_MS",
                ),
                auditManifest: this.config.get(
                  "AUDIT_MANIFEST_WORKER_INTERVAL_MS",
                ),
                inventoryCheck: this.config.get("INVENTORY_CHECK_INTERVAL_MS"),
                queueMonitor: this.config.get(
                  "OPERATIONS_QUEUE_MONITOR_INTERVAL_MS",
                ),
              } as Record<string, number>
            )[row.name] ?? 60000;
          return [
            row.name,
            {
              ...row,
              cycleLagSeconds: row.lastSucceededAt
                ? Math.max(
                    0,
                    Math.floor(
                      (Date.now() - row.lastSucceededAt.getTime()) / 1000,
                    ),
                  )
                : null,
              latestCycleFailed:
                !!row.lastFailedAt &&
                (!row.lastSucceededAt ||
                  row.lastFailedAt > row.lastSucceededAt),
              stale:
                !row.lastSucceededAt ||
                Date.now() - row.lastSucceededAt.getTime() >
                  Math.max(60000, interval * 3),
            },
          ];
        }),
      ),
      absenceEvaluationIssues: await this.prisma.absenceEvaluationIssue.count(),
    };
  }

  async listJobs(query: OperationsList) {
    const where: Prisma.OperationalJobExecutionWhereInput = {
      state: query.state as OperationalJobState | undefined,
      name: query.name ? { contains: query.name } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.operationalJobExecution.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          name: true,
          idempotencyKey: true,
          state: true,
          actorType: true,
          correlationId: true,
          errorCode: true,
          attempts: true,
          maxAttempts: true,
          nextAttemptAt: true,
          leaseUntil: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          attemptHistory: {
            orderBy: { number: "desc" },
            take: 5,
            select: {
              id: true,
              number: true,
              result: true,
              errorCode: true,
              startedAt: true,
              completedAt: true,
            },
          },
        },
      }),
      this.prisma.operationalJobExecution.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  queues() {
    return queueObservability(this.prisma);
  }

  async absenceIssues(query: OperationsList) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.absenceEvaluationIssue.findMany({
        orderBy: [{ fecha: "desc" }, { userId: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.absenceEvaluationIssue.count(),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  reprocessAbsences(
    actor: AuthUser,
    key: string,
    input: { date: string; reason: string },
  ) {
    if (!this.transaction) throw new ApiException("OPERATIONS_NOT_READY", 503);
    const today = localParts(new Date()).day;
    if (input.date >= today || input.date < nextDay(today, -31))
      throw new ApiException("ABSENCE_REPROCESS_RANGE_INVALID", 400);
    return this.transaction.run(
      actor,
      key,
      { action: "ABSENCE_REPROCESS", ...input },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM CalendarRevision WHERE id = 'global' FOR UPDATE`;
        const progress = await tx.absenceEvaluationProgress.findUnique({
          where: { id: "global" },
        });
        // Do not advance beyond an older unfinished checkpoint.
        const date =
          progress &&
          !progress.completed &&
          progress.fecha < dateColumn(input.date)
            ? progress.fecha
            : dateColumn(input.date);
        await tx.absenceEvaluationProgress.upsert({
          where: { id: "global" },
          create: {
            id: "global",
            fecha: date,
            afterUserId: 0,
            completed: false,
          },
          update: { fecha: date, afterUserId: 0, completed: false },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            action: "ABSENCE_REPROCESS_REQUESTED",
            resource: "absences",
            reason: input.reason,
            metadata: { date: date.toISOString().slice(0, 10) },
          },
          tx,
        );
        return {
          scheduled: true,
          date: date.toISOString().slice(0, 10),
          historicalInference: false,
        };
      },
    );
  }

  retryJob(
    actor: AuthUser,
    id: string,
    key: string,
    input: { attempts: number; reason: string },
  ) {
    if (!this.transaction) throw new ApiException("OPERATIONS_NOT_READY", 503);
    return this.transaction.run(
      actor,
      key,
      { action: "JOB_RETRY_REQUEST", id, ...input },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM OperationalJobExecution WHERE id = ${id} FOR UPDATE`;
        const job = await tx.operationalJobExecution.findUnique({
          where: { id },
        });
        if (
          !job ||
          job.state !== "RETRY_SCHEDULED" ||
          job.attempts !== input.attempts ||
          job.attempts >= job.maxAttempts ||
          job.leaseOwner
        )
          throw new ApiException("JOB_NOT_RETRYABLE", 409);
        await tx.operationalJobExecution.update({
          where: { id },
          data: { nextAttemptAt: new Date() },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            actorRole: actor.rol,
            action: "JOB_RETRY_REQUESTED",
            resource: "operations-job",
            module: "OPERATIONS",
            objectId: id,
            reason: input.reason,
            metadata: { attempts: job.attempts },
          },
          tx,
        );
        // Only advances the schedule. Never claims/completes a job or resets its attempt budget.
        return {
          id,
          state: job.state,
          attempts: job.attempts,
          retryRequested: true,
        };
      },
    );
  }

  /** Worker callers pass the epoch they claimed; HTTP callers keep a plain transaction. */
  private fenced<T>(
    barrierVersion: number | undefined,
    apply: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return barrierVersion === undefined
      ? this.prisma.$transaction(apply)
      : withWorkerWriteBarrier(this.prisma, apply, barrierVersion);
  }

  createJob(input: CreateJob, actor?: AuthUser, barrierVersion?: number) {
    return this.fenced(barrierVersion, async (tx) => {
      const job = await tx.operationalJobExecution.upsert({
        where: { idempotencyKey: input.idempotencyKey },
        update: {},
        create: {
          name: input.name,
          idempotencyKey: input.idempotencyKey,
          payload: input.payload as Prisma.InputJsonValue | undefined,
          maxAttempts:
            input.maxAttempts ?? this.config.get("OPERATIONS_JOB_MAX_ATTEMPTS"),
        },
      });
      await this.audit.append(
        {
          actorType: actor ? "HUMAN" : "SYSTEM",
          actorId: actor?.id,
          actorRole: actor?.rol,
          action: "JOB_ENSURE",
          resource: "operations-job",
          module: "OPERATIONS",
          objectType: "JOB_EXECUTION",
          objectId: job.id,
          jobId: job.id,
          result: "SUCCESS",
          metadata: { state: job.state },
        },
        tx,
      );
      return job;
    });
  }

  async claimJob(
    id: string,
    input: ClaimJob,
    actor?: AuthUser,
    barrierVersion?: number,
  ) {
    const leaseMs =
      input.leaseMs ?? this.config.get("OPERATIONS_JOB_LEASE_MS") ?? 120_000;
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseMs);
    return this.fenced(barrierVersion, async (tx) => {
      const job = await tx.operationalJobExecution.findFirst({
        where: {
          id,
          state: {
            in: [
              OperationalJobState.PENDING,
              OperationalJobState.RETRY_SCHEDULED,
              OperationalJobState.RUNNING,
            ],
          },
          nextAttemptAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
      });
      if (!job || job.attempts >= job.maxAttempts)
        throw new ApiException("JOB_NOT_CLAIMABLE", 409);
      const attempt = job.attempts + 1;
      const claimed = await tx.operationalJobExecution.updateMany({
        where: {
          id,
          state: job.state,
          attempts: job.attempts,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: {
          state: OperationalJobState.RUNNING,
          attempts: attempt,
          leaseOwner: input.owner,
          leaseUntil,
          startedAt: job.startedAt ?? now,
        },
      });
      if (claimed.count !== 1)
        throw new ApiException("JOB_LEASE_CONFLICT", 409);
      if (job.state === OperationalJobState.RUNNING && job.attempts > 0)
        await tx.operationalJobAttempt.updateMany({
          where: {
            executionId: id,
            number: job.attempts,
            result: OperationalAttemptResult.RUNNING,
          },
          data: {
            result: OperationalAttemptResult.LEASE_LOST,
            completedAt: now,
          },
        });
      await tx.operationalJobAttempt.create({
        data: { executionId: id, number: attempt, owner: input.owner },
      });
      await this.audit.append(
        {
          actorType: actor ? "HUMAN" : "SYSTEM",
          actorId: actor?.id,
          actorRole: actor?.rol,
          action: "JOB_CLAIM",
          resource: "operations-job",
          module: "OPERATIONS",
          objectType: "JOB_EXECUTION",
          objectId: id,
          jobId: id,
          result: "SUCCESS",
          metadata: { state: OperationalJobState.RUNNING, attempt },
        },
        tx,
      );
      return tx.operationalJobExecution.findUniqueOrThrow({ where: { id } });
    });
  }

  async completeJob(
    id: string,
    input: CompleteJob,
    actor?: AuthUser,
    barrierVersion?: number,
  ) {
    return this.fenced(barrierVersion, async (tx) => {
      const job = await tx.operationalJobExecution.findUnique({
        where: { id },
      });
      if (
        !job ||
        job.state !== OperationalJobState.RUNNING ||
        job.leaseOwner !== input.owner ||
        !job.leaseUntil ||
        job.leaseUntil < new Date()
      )
        throw new ApiException("JOB_LEASE_LOST", 409);
      const changed = await tx.operationalJobExecution.updateMany({
        where: {
          id,
          state: OperationalJobState.RUNNING,
          leaseOwner: input.owner,
          attempts: job.attempts,
          leaseUntil: { gte: new Date() },
        },
        data: {
          state: OperationalJobState.SUCCEEDED,
          result: input.result as Prisma.InputJsonValue | undefined,
          completedAt: new Date(),
          leaseOwner: null,
          leaseUntil: null,
        },
      });
      if (changed.count !== 1) throw new ApiException("JOB_LEASE_LOST", 409);
      await tx.operationalJobAttempt.updateMany({
        where: {
          executionId: id,
          number: job.attempts,
          result: OperationalAttemptResult.RUNNING,
        },
        data: {
          result: OperationalAttemptResult.SUCCEEDED,
          completedAt: new Date(),
        },
      });
      await this.audit.append(
        {
          actorType: actor ? "HUMAN" : "SYSTEM",
          actorId: actor?.id,
          actorRole: actor?.rol,
          action: "JOB_COMPLETE",
          resource: "operations-job",
          module: "OPERATIONS",
          objectType: "JOB_EXECUTION",
          objectId: id,
          jobId: id,
          result: "SUCCESS",
        },
        tx,
      );
      return tx.operationalJobExecution.findUniqueOrThrow({ where: { id } });
    });
  }

  async failJob(
    id: string,
    input: FailJob,
    actor?: AuthUser,
    barrierVersion?: number,
  ) {
    return this.fenced(barrierVersion, async (tx) => {
      const job = await tx.operationalJobExecution.findUnique({
        where: { id },
      });
      if (
        !job ||
        job.state !== OperationalJobState.RUNNING ||
        job.leaseOwner !== input.owner ||
        !job.leaseUntil ||
        job.leaseUntil < new Date()
      )
        throw new ApiException("JOB_LEASE_LOST", 409);
      const terminal = job.attempts >= job.maxAttempts;
      const nextAttemptAt = new Date(
        Date.now() +
          this.config.get("OPERATIONS_RETRY_BASE_MS") * 2 ** (job.attempts - 1),
      );
      const changed = await tx.operationalJobExecution.updateMany({
        where: {
          id,
          state: OperationalJobState.RUNNING,
          leaseOwner: input.owner,
          attempts: job.attempts,
          leaseUntil: { gte: new Date() },
        },
        data: {
          state: terminal
            ? OperationalJobState.FAILED
            : OperationalJobState.RETRY_SCHEDULED,
          errorCode: input.errorCode,
          nextAttemptAt,
          completedAt: terminal ? new Date() : null,
          leaseOwner: null,
          leaseUntil: null,
        },
      });
      if (changed.count !== 1) throw new ApiException("JOB_LEASE_LOST", 409);
      await tx.operationalJobAttempt.updateMany({
        where: {
          executionId: id,
          number: job.attempts,
          result: OperationalAttemptResult.RUNNING,
        },
        data: {
          result: OperationalAttemptResult.FAILED,
          errorCode: input.errorCode,
          completedAt: new Date(),
        },
      });
      const failed = await tx.operationalJobExecution.findUniqueOrThrow({
        where: { id },
      });
      if (terminal)
        await tx.operationalAlert.create({
          data: {
            severity: "S2",
            source: "JOB",
            code: input.errorCode,
            message: `Job ${job.name} exhausted its retry policy`,
            jobExecutionId: id,
          },
        });
      await this.audit.append(
        {
          actorType: actor ? "HUMAN" : "SYSTEM",
          actorId: actor?.id,
          actorRole: actor?.rol,
          action: "JOB_FAIL",
          resource: "operations-job",
          module: "OPERATIONS",
          objectType: "JOB_EXECUTION",
          objectId: id,
          jobId: id,
          result: "FAILED",
          reason: input.errorCode,
          metadata: { state: failed.state, attempt: job.attempts },
        },
        tx,
      );
      return failed;
    });
  }

  listAlerts(query: OperationsList) {
    return this.prisma.operationalAlert.findMany({
      where: { state: query.state as OperationalAlertState | undefined },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
  }

  acknowledgeAlert(actor: AuthUser, id: string, key?: string) {
    return this.transitionAlert(
      actor,
      id,
      OperationalAlertState.ACKNOWLEDGED,
      undefined,
      key,
    );
  }

  resolveAlert(actor: AuthUser, id: string, resolution: string, key?: string) {
    return this.transitionAlert(
      actor,
      id,
      OperationalAlertState.RESOLVED,
      resolution,
      key,
    );
  }

  private async transitionAlert(
    actor: AuthUser,
    id: string,
    state: OperationalAlertState,
    resolution?: string,
    key?: string,
  ) {
    const apply = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM OperationalAlert WHERE id = ${id} FOR UPDATE`;
      const alert = await tx.operationalAlert.findUnique({ where: { id } });
      if (!alert) throw new ApiException("ALERT_NOT_FOUND", 404);
      if (
        state === OperationalAlertState.ACKNOWLEDGED &&
        alert.state !== OperationalAlertState.OPEN
      )
        throw new ApiException("ALERT_STATE_CONFLICT", 409);
      if (
        state === OperationalAlertState.RESOLVED &&
        alert.state === OperationalAlertState.RESOLVED
      )
        throw new ApiException("ALERT_STATE_CONFLICT", 409);
      const changed = await tx.operationalAlert.updateMany({
        where: { id, state: alert.state },
        data:
          state === OperationalAlertState.ACKNOWLEDGED
            ? { state, acknowledgedById: actor.id, acknowledgedAt: new Date() }
            : {
                state,
                resolvedById: actor.id,
                resolvedAt: new Date(),
                resolution,
              },
      });
      if (changed.count !== 1)
        throw new ApiException("ALERT_STATE_CONFLICT", 409);
      const updated = await tx.operationalAlert.findUniqueOrThrow({
        where: { id },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          actorRole: actor.rol,
          action: `ALERT_${state}`,
          resource: "operations-alert",
          module: "OPERATIONS",
          objectType: "ALERT",
          objectId: id,
          result: "SUCCESS",
          reason: resolution,
        },
        tx,
      );
      return updated;
    };
    return key && this.transaction
      ? this.transaction.run(
          actor,
          key,
          { action: "ALERT_TRANSITION", id, state, resolution },
          apply,
        )
      : this.prisma.$transaction(apply);
  }

  listIncidents(query: OperationsList) {
    return this.prisma.operationalIncident.findMany({
      where: { state: query.state as OperationalIncidentState | undefined },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { history: { orderBy: { occurredAt: "desc" }, take: 20 } },
    });
  }

  async createIncident(actor: AuthUser, input: CreateIncident, key?: string) {
    const postmortemRequired =
      input.severity === "S1" || (input.severity === "S2" && input.repeatedS2);
    const due = postmortemRequired ? addBusinessDays(new Date(), 2) : null;
    const apply = async (tx: Prisma.TransactionClient) => {
      const incident = await tx.operationalIncident.create({
        data: {
          externalTicketRef: input.externalTicketRef,
          severity: input.severity,
          ownerId: input.ownerId,
          reason: input.reason,
          communications: input.communications as
            Prisma.InputJsonValue | undefined,
          repeatedS2: input.repeatedS2,
          postmortemDueAt: due,
        },
      });
      await tx.operationalIncidentEvent.create({
        data: {
          incidentId: incident.id,
          actorId: actor.id,
          nextState: incident.state,
          nextSeverity: incident.severity,
          ownerId: incident.ownerId,
          reason: input.reason,
        },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          actorRole: actor.rol,
          action: "INCIDENT_CREATE",
          resource: "operations-incident",
          module: "OPERATIONS",
          objectType: "INCIDENT",
          objectId: incident.id,
          result: "SUCCESS",
          reason: input.reason,
          metadata: { state: incident.state, code: input.externalTicketRef },
        },
        tx,
      );
      return incident;
    };
    return key && this.transaction
      ? this.transaction.run(
          actor,
          key,
          { action: "INCIDENT_CREATE", ...input },
          apply,
        )
      : this.prisma.$transaction(apply);
  }

  async updateIncident(
    actor: AuthUser,
    id: string,
    input: UpdateIncident,
    key?: string,
  ) {
    const apply = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM OperationalIncident WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.operationalIncident.findUnique({
        where: { id },
      });
      if (!existing) throw new ApiException("INCIDENT_NOT_FOUND", 404);
      const state = input.state as OperationalIncidentState | undefined;
      const severity = input.severity;
      const postmortemDueAt =
        (severity === "S1" || (severity === "S2" && existing.repeatedS2)) &&
        !existing.postmortemDueAt
          ? addBusinessDays(new Date(), 2)
          : undefined;
      const incident = await tx.operationalIncident.update({
        where: { id },
        data: {
          state,
          severity,
          ownerId: input.ownerId,
          reason: input.reason,
          communications: input.communications as
            Prisma.InputJsonValue | undefined,
          resolvedAt:
            state === OperationalIncidentState.RESUELTO ||
            state === OperationalIncidentState.CERRADO
              ? new Date()
              : state
                ? null
                : undefined,
          postmortemDueAt,
        },
      });
      await tx.operationalIncidentEvent.create({
        data: {
          incidentId: id,
          actorId: actor.id,
          previousState: existing.state,
          nextState: incident.state,
          previousSeverity: existing.severity,
          nextSeverity: incident.severity,
          ownerId: incident.ownerId,
          reason: input.reason ?? "COMMUNICATION_UPDATE",
        },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          actorRole: actor.rol,
          action: "INCIDENT_UPDATE",
          resource: "operations-incident",
          module: "OPERATIONS",
          objectType: "INCIDENT",
          objectId: id,
          result: "SUCCESS",
          reason: input.reason,
          diff: {
            before: { state: existing.state, ownerId: existing.ownerId },
            after: { state: incident.state, ownerId: incident.ownerId },
            fields: Object.keys(input),
          },
        },
        tx,
      );
      return incident;
    };
    return key && this.transaction
      ? this.transaction.run(
          actor,
          key,
          { action: "INCIDENT_UPDATE", id, ...input },
          apply,
        )
      : this.prisma.$transaction(apply);
  }
}
