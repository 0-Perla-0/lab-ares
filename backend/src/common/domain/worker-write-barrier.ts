import type { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "../../generated/prisma/client";
import { ApiException } from "../errors/api.exception";

/** Serialize a durable worker effect with freeze/unfreeze, including ABA epochs.
 * External preparations may leave private orphans; publication must use this lock.
 * Do not keep this transaction open for an unbounded export or SMTP operation. */
export async function withWorkerWriteBarrier<T>(
  db: PrismaService,
  effect: (tx: Prisma.TransactionClient, version: number) => Promise<T>,
  expectedVersion?: number,
  timeout = 30000,
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM RecoveryWriteBarrier WHERE id = 'global' LOCK IN SHARE MODE`;
      const barrier = await tx.recoveryWriteBarrier.findUnique({
        where: { id: "global" },
      });
      if (
        !barrier ||
        barrier.active ||
        (expectedVersion !== undefined && barrier.version !== expectedVersion)
      )
        throw new ApiException("RECOVERY_WRITE_BARRIER_ACTIVE", 503);
      return effect(tx, barrier.version);
    },
    { isolationLevel: "ReadCommitted", timeout },
  );
}
