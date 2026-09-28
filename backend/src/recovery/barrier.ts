import type { PrismaService } from "../database/prisma.service";

export interface WriteBarrierSnapshot {
  active: boolean;
  runId: string | null;
  version: number;
  frozenAt: Date | null;
  snapshotAt: Date | null;
}

const CLOSED: WriteBarrierSnapshot = {
  active: true,
  runId: null,
  version: -1,
  frozenAt: null,
  snapshotAt: null,
};

export async function readWriteBarrier(
  prisma: PrismaService,
): Promise<WriteBarrierSnapshot> {
  try {
    const barrier = await prisma.recoveryWriteBarrier.findUnique({
      where: { id: "global" },
      select: {
        active: true,
        runId: true,
        version: true,
        frozenAt: true,
        snapshotAt: true,
      },
    });
    return barrier ?? CLOSED;
  } catch {
    return CLOSED;
  }
}

export async function workersMayMutate(prisma: PrismaService) {
  const barrier = await readWriteBarrier(prisma);
  return !barrier.active;
}

export async function assertRecoveryBarrier(
  prisma: PrismaService,
  runId: string,
  version: number,
) {
  const barrier = await readWriteBarrier(prisma);
  return (
    barrier.active && barrier.runId === runId && barrier.version === version
  );
}
