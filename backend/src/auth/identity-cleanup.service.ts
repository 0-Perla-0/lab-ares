import {
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { withWorkerWriteBarrier } from "../common/domain/worker-write-barrier";
import { ApiException } from "../common/errors/api.exception";

@Injectable()
export class IdentityCleanupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly prisma: PrismaService) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.run(), 15 * 60_000);
    this.timer.unref();
    void this.run();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async run(
    now = new Date(),
    retentionDays = Number(
      process.env.IDENTITY_INVITATION_RETENTION_DAYS ?? 30,
    ),
  ) {
    if (this.running) return;
    this.running = true;
    try {
      const cutoff = new Date(
        now.getTime() - Math.max(0, retentionDays) * 24 * 60 * 60_000,
      );
      await withWorkerWriteBarrier(this.prisma, async (tx: any) => {
        if (tx.authThrottle)
          await tx.authThrottle.deleteMany({
            where: {
              resetAt: { lt: now },
              OR: [{ blockedUntil: null }, { blockedUntil: { lt: now } }],
            },
          });
        await tx.recoveryToken.deleteMany({
          where: {
            OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
          },
        });
        await tx.session.deleteMany({
          where: {
            OR: [
              { expiresAt: { lt: now } },
              { absoluteExpiresAt: { lt: now } },
              { revokedAt: { not: null } },
            ],
          },
        });
        if (tx.mfaChallenge)
          await tx.mfaChallenge.deleteMany({
            where: {
              OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }],
            },
          });
        if (tx.mfaRecoveryCode)
          await tx.mfaRecoveryCode.deleteMany({
            where: { usedAt: { not: null, lt: cutoff } },
          });
        if (tx.outboxEvent)
          await tx.outboxEvent.deleteMany({
            where: { processedAt: { not: null, lt: cutoff } },
          });
        // Invitations are retained for audit/history. Only mark them archived;
        // never delete them as part of identity maintenance.
        await tx.invitation.updateMany({
          where: {
            archivedAt: null,
            OR: [
              { usedAt: { not: null, lt: cutoff } },
              { revokedAt: { not: null, lt: cutoff } },
              { expiresAt: { lt: cutoff } },
            ],
          },
          data: { archivedAt: now },
        });
      });
    } catch (error) {
      // Frozen for recovery: maintenance simply waits for the next cycle.
      if (!(
        error instanceof ApiException &&
        error.code === "RECOVERY_WRITE_BARRIER_ACTIVE"
      ))
        throw error;
    } finally {
      this.running = false;
    }
  }
}
