import {
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../auth/audit.service";
import { observeWorker } from "../common/domain/worker-heartbeat";

export const queueSloSchema = z
  .object({
    outbox: z.number().int().min(60).max(604800).optional(),
    storage: z.number().int().min(60).max(604800).optional(),
    reports: z.number().int().min(60).max(604800).optional(),
    retention: z.number().int().min(60).max(604800).optional(),
    suppressionJournal: z.number().int().min(60).max(604800).optional(),
    objectDeletion: z.number().int().min(60).max(604800).optional(),
  })
  .strict();
export function parseQueueSlos(value: string) {
  return queueSloSchema.parse(JSON.parse(value || "{}"));
}

@Injectable()
export class QueueMonitorWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}
  onModuleInit() {
    if (!this.config.get("OPERATIONS_QUEUE_MONITOR_ENABLED", false)) return;
    this.timer = setInterval(
      () => {
        if (!this.running)
          void observeWorker(this.db, "queueMonitor", () => this.monitor());
      },
      this.config.get("OPERATIONS_QUEUE_MONITOR_INTERVAL_MS", 60000),
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async monitor(now = new Date()) {
    if (this.running) return 0;
    this.running = true;
    try {
      const slos = parseQueueSlos(
        this.config.get("OPERATIONS_QUEUE_SLO_JSON", "{}"),
      );
      if (!Object.keys(slos).length) return 0;
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM RecoveryWriteBarrier WHERE id = 'global' LOCK IN SHARE MODE`;
          const barrier = await tx.recoveryWriteBarrier.findUnique({
            where: { id: "global" },
          });
          if (!barrier || barrier.active) return 0;
          // All replicas serialize alert creation on this existing unique row.
          await tx.$executeRaw`INSERT INTO WorkerHeartbeat (name, lastStartedAt, updatedAt) VALUES ('queueMonitor', ${now}, ${now}) ON DUPLICATE KEY UPDATE lastStartedAt = ${now}, updatedAt = ${now}`;
          const rows = await tx.$queryRaw<
            {
              queue: keyof z.infer<typeof queueSloSchema>;
              depth: bigint;
              oldest: Date | null;
            }[]
          >`
          SELECT 'outbox' AS queue, COUNT(*) AS depth, MIN(occurredAt) AS oldest FROM OutboxEvent WHERE state IN ('PENDING', 'PROCESSING')
          UNION ALL
          SELECT 'storage', COUNT(*), MIN(createdAt) FROM Archivo WHERE status IN ('PENDIENTE_ANALISIS', 'ANALIZANDO', 'ERROR_ANALISIS') AND analysisExhaustedAt IS NULL
          UNION ALL
          SELECT 'reports', COUNT(*), MIN(createdAt) FROM ReporteExportacion WHERE status IN ('PENDIENTE', 'GENERANDO')
          UNION ALL
          SELECT 'retention', COUNT(*), MIN(e.createdAt) FROM ElementoLoteSupresion e JOIN LoteSupresion l ON l.id = e.loteId WHERE e.estado IN ('PENDIENTE', 'PROCESANDO') AND l.estado IN ('AUTORIZADO', 'EN_EJECUCION')
          UNION ALL
          SELECT 'suppressionJournal', COUNT(*), MIN(createdAt) FROM SuppressionJournalEntry WHERE state IN ('PENDING', 'PROCESSING')
          UNION ALL
          SELECT 'objectDeletion', COUNT(*), MIN(createdAt) FROM ObjectDeletionJob WHERE state IN ('PREPARED', 'DISPATCHED', 'UNCERTAIN', 'VERIFIED')
        `;
          let created = 0;
          for (const row of rows) {
            const threshold = slos[row.queue];
            if (
              !threshold ||
              !row.oldest ||
              now.getTime() - row.oldest.getTime() < threshold * 1000
            )
              continue;
            const source = `queue:${row.queue}`,
              code = "QUEUE_BACKLOG_SLO_EXCEEDED";
            if (
              await tx.operationalAlert.findFirst({
                where: { source, code, state: { not: "RESOLVED" } },
              })
            )
              continue;
            const alert = await tx.operationalAlert.create({
              data: {
                source,
                code,
                severity: "S2",
                message:
                  "Pending queue age exceeds its explicitly configured SLO; delivery and worker processing require independent review.",
              },
            });
            await this.audit.append(
              {
                actorType: "SYSTEM",
                action: code,
                resource: "queue",
                objectId: alert.id,
                metadata: {
                  queue: row.queue,
                  thresholdSeconds: threshold,
                  pendingDepth: Number(row.depth),
                },
              },
              tx,
            );
            created++;
          }
          return created;
        },
        { isolationLevel: "ReadCommitted", timeout: 30000 },
      );
    } finally {
      this.running = false;
    }
  }
}
