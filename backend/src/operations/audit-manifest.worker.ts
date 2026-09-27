import { ConfigService } from "@nestjs/config";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import type { Environment } from "../config/environment";
import { OperationalJobState } from "../generated/prisma/enums";
import { AuditQueryService } from "./audit-query.service";
import { OperationsService } from "./operations.service";
import { TechnicalLogger } from "./technical-logger.service";

@Injectable()
export class AuditManifestWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly audit: AuditQueryService,
    private readonly operations: OperationsService,
    private readonly logger: TechnicalLogger,
  ) {}

  onModuleInit() {
    if (!this.config.get("AUDIT_MANIFEST_WORKER_ENABLED")) return;
    this.timer = setInterval(
      () => void this.tick(),
      this.config.get("AUDIT_MANIFEST_WORKER_INTERVAL_MS"),
    );
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    const previous = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    )
      .toISOString()
      .slice(0, 10);
    const owner = `audit-manifest:${process.pid}`;
    let claimed = false;
    let jobId: string | undefined;
    try {
      const job = await this.operations.createJob({
        name: "AUDIT_DAILY_MANIFEST",
        idempotencyKey: `audit-manifest:${previous}`,
        maxAttempts: this.config.get("OPERATIONS_JOB_MAX_ATTEMPTS"),
      });
      jobId = job.id;
      if (
        job.state === OperationalJobState.SUCCEEDED ||
        job.state === OperationalJobState.RUNNING ||
        job.state === OperationalJobState.FAILED ||
        job.state === OperationalJobState.CANCELLED
      )
        return;
      await this.operations.claimJob(job.id, { owner });
      claimed = true;
      await this.audit.createSystemManifest(previous);
      await this.operations.completeJob(job.id, {
        owner,
        result: { period: previous, verified: true },
      });
      this.logger.write("log", "audit_manifest_created", { period: previous });
    } catch (error) {
      this.logger.write("error", "audit_manifest_failed", {
        period: previous,
        error: error instanceof Error ? error.message : "unknown",
      });
      if (claimed && jobId)
        try {
          await this.operations.failJob(jobId, {
            owner,
            errorCode: "AUDIT_MANIFEST_FAILED",
          });
        } catch (failureError) {
          this.logger.write("error", "audit_manifest_job_failure_failed", {
            error:
              failureError instanceof Error ? failureError.message : "unknown",
          });
        }
    }
  }
}
