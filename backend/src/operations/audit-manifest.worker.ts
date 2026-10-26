import { ConfigService } from "@nestjs/config";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import type { Environment } from "../config/environment";
import { OperationalJobState } from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import { workersMayMutate } from "../recovery/barrier";
import { withWorkerWriteBarrier } from "../common/domain/worker-write-barrier";
import { ApiException } from "../common/errors/api.exception";
import { AuditQueryService } from "./audit-query.service";
import { OperationsService } from "./operations.service";
import { TechnicalLogger } from "./technical-logger.service";
import { observeWorker } from "../common/domain/worker-heartbeat";

@Injectable()
export class AuditManifestWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly audit: AuditQueryService,
    private readonly operations: OperationsService,
    private readonly logger: TechnicalLogger,
    private readonly prisma?: PrismaService,
  ) {}

  onModuleInit() {
    if (!this.config.get("AUDIT_MANIFEST_WORKER_ENABLED")) return;
    this.timer = setInterval(
      () => this.schedule(),
      this.config.get("AUDIT_MANIFEST_WORKER_INTERVAL_MS"),
    );
    this.timer.unref();
    this.schedule();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private schedule() {
    if (!this.running && this.prisma)
      void observeWorker(this.prisma, "auditManifest", () => this.tick());
  }

  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      if (this.prisma && !(await workersMayMutate(this.prisma))) return;
      // Every durable step of this cycle commits in the epoch read here.
      let epoch: number | undefined;
      if (this.prisma)
        try {
          epoch = await withWorkerWriteBarrier(
            this.prisma,
            async (_tx, v) => v,
          );
        } catch (error) {
          if (
            error instanceof ApiException &&
            error.code === "RECOVERY_WRITE_BARRIER_ACTIVE"
          )
            return;
          throw error;
        }
      const previous = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
      )
        .toISOString()
        .slice(0, 10);
      const owner = `audit-manifest:${process.pid}`;
      let claimed = false;
      let jobId: string | undefined;
      try {
        const job = await this.operations.createJob(
          {
            name: "AUDIT_DAILY_MANIFEST",
            idempotencyKey: `audit-manifest:${previous}`,
            maxAttempts: this.config.get("OPERATIONS_JOB_MAX_ATTEMPTS"),
          },
          undefined,
          epoch,
        );
        jobId = job.id;
        if (
          job.state === OperationalJobState.SUCCEEDED ||
          job.state === OperationalJobState.RUNNING ||
          job.state === OperationalJobState.FAILED ||
          job.state === OperationalJobState.CANCELLED
        )
          return;
        await this.operations.claimJob(job.id, { owner }, undefined, epoch);
        claimed = true;
        await this.audit.createSystemManifest(previous, epoch);
        await this.operations.completeJob(
          job.id,
          { owner, result: { period: previous, verified: true } },
          undefined,
          epoch,
        );
        this.logger.write("log", "audit_manifest_created", {
          period: previous,
        });
      } catch (error) {
        this.logger.write("error", "audit_manifest_failed", {
          period: previous,
          error: error instanceof Error ? error.message : "unknown",
        });
        if (claimed && jobId)
          try {
            await this.operations.failJob(
              jobId,
              { owner, errorCode: "AUDIT_MANIFEST_FAILED" },
              undefined,
              epoch,
            );
          } catch (failureError) {
            this.logger.write("error", "audit_manifest_job_failure_failed", {
              error:
                failureError instanceof Error
                  ? failureError.message
                  : "unknown",
            });
          }
        throw error;
      }
    } finally {
      this.running = false;
    }
  }
}
