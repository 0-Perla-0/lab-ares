import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "../auth/audit.service";
import { PrismaService } from "../database/prisma.service";
import { workersMayMutate } from "../recovery/barrier";
import { withWorkerWriteBarrier } from "../common/domain/worker-write-barrier";
import { ApiException } from "../common/errors/api.exception";
import { closeOverdue } from "./attendance-cutoff";
import { dailyCutoff } from "./attendance-risk";
import { observeWorker } from "../common/domain/worker-heartbeat";
@Injectable()
export class AttendanceWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(AttendanceWorker.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (this.config.get("ATTENDANCE_WORKER_ENABLED", false))
      this.timer = setInterval(() => {
        if (!this.running)
          void observeWorker(this.prisma, "attendance", () =>
            this.processDue(),
          );
      }, 30000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async processDue(limit = 100, now = new Date()) {
    if (this.running) return 0;
    this.running = true;
    try {
      if (!(await workersMayMutate(this.prisma))) return 0;
      const due = await this.prisma.asistencia.findMany({
        where: { status: "ABIERTA" },
        orderBy: { checkInAt: "asc" },
        take: limit,
        select: { userId: true, checkInAt: true },
      });
      let count = 0;
      // The first cutoff fixes the epoch; every later row must commit in it.
      let epoch: number | undefined;
      for (const row of due) {
        if (now < dailyCutoff(row.checkInAt)) continue;
        const closed = await withWorkerWriteBarrier(
          this.prisma,
          async (tx, version) => {
            epoch = version;
            await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${row.userId} FOR UPDATE`;
            return closeOverdue(tx, row.userId, now, this.audit);
          },
          epoch,
        );
        if (closed) count++;
      }
      return count;
    } catch (error) {
      // Frozen or a new epoch: stop; the next cycle starts clean.
      if (
        error instanceof ApiException &&
        error.code === "RECOVERY_WRITE_BARRIER_ACTIVE"
      )
        return 0;
      throw error;
    } finally {
      this.running = false;
    }
  }
}
