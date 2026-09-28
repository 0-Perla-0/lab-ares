import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { S3Storage } from "../storage/s3.storage";
import { ClamAvScanner } from "../storage/clamav.scanner";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";
import { readWriteBarrier } from "../recovery/barrier";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage?: S3Storage,
    private readonly scanner?: ClamAvScanner,
    private readonly config?: ConfigService<Environment, true>,
  ) {}

  liveness() {
    return { status: "ok" };
  }

  async dependencies() {
    let database: "connected" | "disconnected" = "disconnected";
    let storage: "connected" | "disconnected" | "not-configured" =
      "not-configured";
    let scanner: "connected" | "disconnected" | "disabled" | "not-configured" =
      "not-configured";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = "connected";
    } catch {}
    if (this.storage) {
      try {
        storage = (await this.storage.health()) ? "connected" : "disconnected";
      } catch {
        storage = "disconnected";
      }
    }
    if (this.config && !this.config.get("STORAGE_SCANNER_ENABLED"))
      scanner = "disabled";
    else if (this.scanner) {
      try {
        scanner = (await this.scanner.health()) ? "connected" : "disconnected";
      } catch {
        scanner = "disconnected";
      }
    }
    return { database, storage, scanner };
  }

  async readiness() {
    const dependencies = await this.dependencies();
    const barrier = await readWriteBarrier(this.prisma);
    const recovery = {
      writeBarrier: barrier.active ? "active" : "inactive",
      runId: barrier.runId,
      version: barrier.version,
      snapshotAt: barrier.snapshotAt,
    };
    if (!this.storage && !this.scanner && !this.config) {
      if (dependencies.database === "connected" && !barrier.active)
        return { status: "ok", database: "connected", recovery };
      throw new ServiceUnavailableException({
        status: "error",
        database: dependencies.database,
        recovery,
      });
    }
    const status =
      dependencies.database === "connected" &&
      !["disconnected"].includes(dependencies.storage) &&
      !["disconnected"].includes(dependencies.scanner) &&
      !barrier.active
        ? "ok"
        : "error";
    const result = { status, ...dependencies, dependencies, recovery };
    if (status === "error") throw new ServiceUnavailableException(result);
    return result;
  }
}
