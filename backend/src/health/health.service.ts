import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { S3Storage } from "../storage/s3.storage";
import { ClamAvScanner } from "../storage/clamav.scanner";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService, private readonly storage?: S3Storage, private readonly scanner?: ClamAvScanner, private readonly config?: ConfigService<Environment, true>) {}

  liveness() {
    return { status: "ok" };
  }

  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      if (!this.storage || !this.scanner || !this.config) return { status: "ok", database: "connected" }; const buckets = await this.storage.health(); const scanner = !this.config.get("STORAGE_SCANNER_ENABLED") || await this.scanner.health(); if (!buckets || !scanner) throw new Error("storage unavailable"); return { status: "ok", database: "connected", storage: "connected", scanner: scanner ? "connected" : "disabled" };
    } catch {
      throw new ServiceUnavailableException({
        status: "error",
        database: "disconnected",
      });
    }
  }
}
