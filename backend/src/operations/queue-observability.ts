import type { PrismaService } from "../database/prisma.service";

export async function queueObservability(db: PrismaService, now = new Date()) {
  const rows = await db.$queryRaw<
    {
      queue: string;
      state: string;
      depth: bigint;
      oldestCreatedAt: Date | null;
      expiredLeases: bigint;
    }[]
  >`
    SELECT 'outbox' AS queue, state, COUNT(*) AS depth, MIN(occurredAt) AS oldestCreatedAt,
      COALESCE(SUM(leaseUntil < ${now}), 0) AS expiredLeases FROM OutboxEvent GROUP BY state
    UNION ALL
    SELECT 'storage', status, COUNT(*), MIN(createdAt), COALESCE(SUM(leaseUntil < ${now}), 0) FROM Archivo GROUP BY status
    UNION ALL
    SELECT 'reports', status, COUNT(*), MIN(createdAt), COALESCE(SUM(leaseUntil < ${now}), 0) FROM ReporteExportacion GROUP BY status
    UNION ALL
    SELECT 'retention', estado, COUNT(*), MIN(createdAt), COALESCE(SUM(leaseUntil < ${now}), 0) FROM ElementoLoteSupresion GROUP BY estado
    UNION ALL
    SELECT 'suppressionJournal', state, COUNT(*), MIN(createdAt), COALESCE(SUM(leaseUntil < ${now}), 0) FROM SuppressionJournalEntry GROUP BY state
    UNION ALL
    SELECT 'objectDeletion', state, COUNT(*), MIN(createdAt), COALESCE(SUM(leaseUntil < ${now}), 0) FROM ObjectDeletionJob GROUP BY state
  `;
  return {
    snapshotAt: now.toISOString(),
    semantics:
      "Per-state inventory, not delivery or processing proof. Age is since creation, not overdue time. No private payloads or account identifiers.",
    queues: rows.map((row) => ({
      ...row,
      depth: Number(row.depth),
      expiredLeases: Number(row.expiredLeases),
      oldestAgeSeconds: row.oldestCreatedAt
        ? Math.max(
            0,
            Math.floor((now.getTime() - row.oldestCreatedAt.getTime()) / 1000),
          )
        : null,
    })),
  };
}
