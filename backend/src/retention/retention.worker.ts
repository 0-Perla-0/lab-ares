import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";
import { RetentionService } from "./retention.service";

@Injectable()
export class RetentionWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly retention: RetentionService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  onModuleInit() {
    if (!this.config.get("RETENTION_WORKER_ENABLED")) return;
    this.timer = setInterval(
      () => void this.process(),
      this.config.get("RETENTION_WORKER_INTERVAL_MS"),
    );
    this.timer.unref();
    void this.process();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async process() {
    if (this.running) return;
    this.running = true;
    try {
      await this.retention.processAuthorized(
        this.config.get("RETENTION_BATCH_SIZE"),
      );
    } catch {
      // Leave failed work queued for the next scheduled pass.
    } finally {
      this.running = false;
    }
  }
}
