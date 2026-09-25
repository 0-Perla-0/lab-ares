import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class IdentityCleanupService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly prisma: PrismaService) {}
  onApplicationBootstrap() { this.timer = setInterval(() => void this.run(), 15 * 60_000); this.timer.unref(); void this.run(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async run(now = new Date(), retentionDays = Number(process.env.IDENTITY_INVITATION_RETENTION_DAYS ?? 30)) {
    if (this.running) return;
    this.running = true;
    try {
      const cutoff = new Date(now.getTime() - Math.max(0, retentionDays) * 24 * 60 * 60_000);
      await this.prisma.$transaction([
        this.prisma.recoveryToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
        this.prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { absoluteExpiresAt: { lt: now } }, { revokedAt: { not: null } }] } }),
        // Invitations are retained for audit/history. Only mark them archived;
        // never delete them as part of identity maintenance.
        this.prisma.invitation.updateMany({
          where: {
            archivedAt: null,
            OR: [
              { usedAt: { not: null, lt: cutoff } },
              { revokedAt: { not: null, lt: cutoff } },
              { expiresAt: { lt: cutoff } },
            ],
          },
          data: { archivedAt: now },
        }),
      ]);
    } finally { this.running = false; }
  }
}
