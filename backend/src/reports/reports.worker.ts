import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { workersMayMutate } from "../recovery/barrier";
import { ReportsService } from "./reports.service";

@Injectable()
export class ReportsWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private inFlight = false;

  constructor(
    private readonly reports: ReportsService,
    private readonly config: ConfigService<Environment, true>,
    private readonly prisma?: PrismaService,
  ) {}

  onModuleInit() {
    if (!this.config.get("REPORTS_WORKER_ENABLED")) return;
    const interval = this.config.get("REPORTS_WORKER_INTERVAL_MS");
    this.timer = setInterval(() => void this.tick(), interval);
    void this.tick();
  }

  private async tick() {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      if (this.prisma && !(await workersMayMutate(this.prisma))) return;
      await this.reports.processDue(this.config.get("REPORTS_BATCH_SIZE"));
      await this.reports.cleanup();
    } finally {
      this.inFlight = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
