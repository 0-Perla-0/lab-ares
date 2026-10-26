import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { ApiException } from "../common/errors/api.exception";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { registerUploadAdmission } from "./upload-admission";

/**
 * Cross-replica admission for private uploads: a leased, counted reservation per
 * in-flight upload, decided under a gate-row lock so two replicas cannot both
 * take the last slot. A replica that dies frees its slots when the lease expires.
 * It bounds concurrent uploads, not disk space: disk and proxy quotas remain a
 * deployment responsibility.
 */
@Injectable()
export class UploadAdmissionService implements OnModuleInit {
  private readonly owner = `${process.pid}-${randomUUID().slice(0, 8)}`;
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  onModuleInit() {
    registerUploadAdmission(this);
  }

  private ceilings() {
    return {
      global: this.config.get("STORAGE_GLOBAL_UPLOAD_CEILING"),
      perUser: this.config.get("STORAGE_USER_UPLOAD_CEILING"),
      leaseMs: this.config.get("STORAGE_UPLOAD_LEASE_MS"),
    };
  }

  async reserve(actorId: number): Promise<string | undefined> {
    const { global, perUser, leaseMs } = this.ceilings();
    if (!global && !perUser) return undefined;
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM UploadAdmissionGate WHERE id = 'global' FOR UPDATE`;
        const now = new Date();
        await tx.uploadAdmission.deleteMany({
          where: { leaseUntil: { lt: now } },
        });
        if (
          global &&
          (await tx.uploadAdmission.count({
            where: { leaseUntil: { gte: now } },
          })) >= global
        )
          throw new ApiException("UPLOAD_CAPACITY_EXCEEDED", 503);
        if (
          perUser &&
          (await tx.uploadAdmission.count({
            where: { actorId, leaseUntil: { gte: now } },
          })) >= perUser
        )
          throw new ApiException("UPLOAD_USER_CAPACITY_EXCEEDED", 429);
        const slot = await tx.uploadAdmission.create({
          data: {
            actorId,
            owner: this.owner,
            leaseUntil: new Date(now.getTime() + leaseMs),
          },
        });
        return slot.id;
      },
      { isolationLevel: "ReadCommitted", timeout: 10000 },
    );
  }

  /** Extends the lease once the body is on disk, before slower domain work. */
  async renew(slot?: string) {
    if (!slot) return;
    const { leaseMs } = this.ceilings();
    await this.db.uploadAdmission.updateMany({
      where: { id: slot, owner: this.owner },
      data: { leaseUntil: new Date(Date.now() + leaseMs) },
    });
  }

  /** Best effort: an unreachable database must not fail a finished upload. */
  async release(slot?: string) {
    if (!slot) return;
    await this.db.uploadAdmission
      .deleteMany({ where: { id: slot, owner: this.owner } })
      .catch(() => undefined);
  }
}
