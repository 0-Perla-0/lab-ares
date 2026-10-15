import type { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "../../generated/prisma/client";

export async function heartbeat(
  db: PrismaService,
  name: string,
  data: Prisma.WorkerHeartbeatUpdateInput,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM RecoveryWriteBarrier WHERE id = 'global' LOCK IN SHARE MODE`;
    const barrier = await tx.recoveryWriteBarrier.findUnique({
      where: { id: "global" },
    });
    if (!barrier || barrier.active) return false;
    await tx.workerHeartbeat.upsert({
      where: { name },
      create: { name, ...data } as Prisma.WorkerHeartbeatCreateInput,
      update: data,
    });
    return true;
  });
}

// Scheduler telemetry does not include payloads or error messages. Recovery
// freeze also stops telemetry writes. Missing barrier is fail-closed.
export async function observeWorker(
  db: PrismaService,
  name: string,
  run: () => Promise<unknown>,
) {
  try {
    if (!(await heartbeat(db, name, { lastStartedAt: new Date() }))) return;
    const result = await run();
    await heartbeat(db, name, {
      lastSucceededAt: new Date(),
      errorCode: null,
      processed: typeof result === "number" ? result : 0,
    });
  } catch {
    await heartbeat(db, name, {
      lastFailedAt: new Date(),
      errorCode: "WORKER_CYCLE_FAILED",
    }).catch(() => undefined);
  }
}
