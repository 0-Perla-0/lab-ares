import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { workersMayMutate } from "../recovery/barrier";
import { RetentionService } from "./retention.service";
import { observeWorker } from "../common/domain/worker-heartbeat";

@Injectable()
export class RetentionWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly retention: RetentionService,
    private readonly config: ConfigService<Environment, true>,
    private readonly prisma?: PrismaService,
  ) {}

  onModuleInit() {
    if (!this.config.get("RETENTION_WORKER_ENABLED")) return;
    this.timer = setInterval(
      () => this.schedule(),
      this.config.get("RETENTION_WORKER_INTERVAL_MS"),
    );
    this.timer.unref();
    this.schedule();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async process() {
    if (this.running) return;
    this.running = true;
    try {
      if (this.prisma && !(await workersMayMutate(this.prisma))) return;
      await this.retention.processAuthorized(
        this.config.get("RETENTION_BATCH_SIZE"),
      );
    } finally {
      this.running = false;
    }
  }
  private schedule() {
    if (!this.running && this.prisma)
      void observeWorker(this.prisma, "retention", () => this.process());
  }
}
