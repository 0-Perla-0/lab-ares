import {
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "../auth/audit.service";
import { PrismaService } from "../database/prisma.service";
import { CalendarService } from "../calendar/calendar.service";
import {
  businessDeadline,
  dateColumn,
  dateLabel,
  mexicoInstant,
  nextDay,
} from "../calendar/calendar-time";
import { localParts } from "../attendance/attendance-risk";
import { lockCalendar } from "./absence-transaction";
import { workersMayMutate } from "../recovery/barrier";
import { historicalDuty } from "../common/domain/operational-history";
import { exceptionIsWorkDay } from "../calendar/calendar.service";
import { observeWorker } from "../common/domain/worker-heartbeat";
import { pilotAllows } from "../common/domain/operational-pilot";
import { operationalNotification } from "../common/domain/operational-notification";
import { FeaturePoliciesService } from "../common/domain/feature-policies.service";

@Injectable()
export class AbsenceEvaluationWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(AbsenceEvaluationWorker.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Optional() private readonly features?: FeaturePoliciesService,
  ) {}
  onModuleInit() {
    if (this.config.get("ABSENCE_WORKER_ENABLED", false)) {
      this.timer = setInterval(() => {
        if (!this.running)
          void observeWorker(this.prisma, "absences", () => this.processDue());
      }, 60000);
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processDue(limit = 100, now = new Date()) {
    if (this.running) return 0;
    this.running = true;
    try {
      if (!(await workersMayMutate(this.prisma))) return 0;
      const expired = await this.expire(limit, now);
      const generated = await this.evaluate(limit, now);
      return expired + generated;
    } finally {
      this.running = false;
    }
  }

  private async expire(limit: number, now: Date) {
    return this.prisma.$transaction(
      async (tx) => {
        await lockCalendar(tx);
        const rows = await tx.ausencia.findMany({
          where: {
            OR: [
              { estado: "PENDIENTE_JUSTIFICACION", plazoLimiteAt: { lt: now } },
              { estado: "EN_ACLARACION", aclaracionLimiteAt: { lt: now } },
            ],
          },
          orderBy: { id: "asc" },
          take: limit,
        });
        for (const row of rows) {
          const appealDeadline = await businessDeadline(now, 3, (day) =>
            this.calendar.isBusinessDay(
              { id: row.userId, sedeId: row.sedeId, areaId: row.areaId },
              day,
              tx,
            ),
          );
          await tx.ausencia.update({
            where: { id: row.id },
            data: {
              estado: "NO_JUSTIFICADA",
              motivoResolucion: "PLAZO_VENCIDO",
              aclaracionLimiteAt: null,
              apelacionLimiteAt: appealDeadline,
              version: { increment: 1 },
            },
          });
          await this.audit.append(
            {
              actorType: "SYSTEM",
              action: "ABSENCE_DEADLINE_EXPIRED",
              resource: "absences",
              objectId: row.id,
              subjectId: row.userId,
              sedeId: row.sedeId,
              areaId: row.areaId,
              metadata: { previousState: row.estado, code: "PLAZO_VENCIDO" },
            },
            tx,
          );
          await operationalNotification(
            tx,
            row.userId,
            "ABSENCE_DEADLINE_EXPIRED",
            {
              ausenciaId: row.id,
              apelacionLimiteAt: appealDeadline.toISOString(),
            },
          );
        }
        return rows.length;
      },
      { isolationLevel: "ReadCommitted", timeout: 30000 },
    );
  }

  private async evaluate(limit: number, now: Date) {
    return this.prisma.$transaction(
      async (tx) => {
        await lockCalendar(tx);
        const today = localParts(now).day;
        let progress = await tx.absenceEvaluationProgress.findUnique({
          where: { id: "global" },
        });
        if (!progress) {
          const start =
            this.config.get<string>("ABSENCE_EVALUATION_START_DATE") ??
            nextDay(today, -1);
          if (start >= today) return 0;
          progress = await tx.absenceEvaluationProgress.create({
            data: { id: "global", fecha: dateColumn(start) },
          });
        }
        let day = dateLabel(progress.fecha);
        if (progress.completed) {
          day = nextDay(day);
          if (day >= today) return 0;
          progress = await tx.absenceEvaluationProgress.update({
            where: { id: "global" },
            data: { fecha: dateColumn(day), afterUserId: 0, completed: false },
          });
        }
        if (day >= today) return 0;
        const start = mexicoInstant(day),
          end = mexicoInstant(nextDay(day));
        const users = await tx.usuario.findMany({
          where: {
            id: { gt: progress.afterUserId },
            createdAt: { lt: end },
          },
          orderBy: { id: "asc" },
          take: limit,
        });
        let count = 0;
        for (const candidate of users) {
          await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${candidate.id} FOR UPDATE`;
          const user = await historicalDuty(tx, candidate.id, day);
          if (user.reason !== undefined) {
            await tx.absenceEvaluationIssue.upsert({
              where: {
                userId_fecha: { userId: candidate.id, fecha: dateColumn(day) },
              },
              create: {
                userId: candidate.id,
                fecha: dateColumn(day),
                reason: user.reason,
              },
              update: { reason: user.reason },
            });
            continue;
          }
          await tx.absenceEvaluationIssue.deleteMany({
            where: { userId: candidate.id, fecha: dateColumn(day) },
          });
          if (!user.eligible || !("isShiftDay" in user)) continue;
          if (!pilotAllows(this.config, user)) continue;
          if (
            this.features &&
            !(await this.features.allowsInTransaction(
              tx,
              "ABSENCES.GENERATE",
              user,
            ))
          )
            continue;
          const exception = await this.calendar.exceptionFor(user, day, tx);
          if (!(exception ? exceptionIsWorkDay(exception) : user.isShiftDay))
            continue;
          if (
            await tx.asistencia.findFirst({
              where: { userId: user.id, checkInAt: { gte: start, lt: end } },
              select: { id: true },
            })
          )
            continue;
          if (
            await tx.ausencia.findUnique({
              where: {
                userId_fecha: { userId: user.id, fecha: dateColumn(day) },
              },
            })
          )
            continue;
          const deadline = await businessDeadline(now, 5, (d) =>
            this.calendar.isBusinessDay(user, d, tx),
          );
          const row = await tx.ausencia.create({
            data: {
              userId: user.id,
              sedeId: user.sedeId,
              areaId: user.areaId,
              turnoId: user.turnoId,
              fecha: dateColumn(day),
              plazoLimiteAt: deadline,
            },
          });
          await this.audit.append(
            {
              actorType: "SYSTEM",
              subjectId: user.id,
              resource: "absences",
              action: "ABSENCE_PROVISIONAL_CREATED",
              objectId: row.id,
              sedeId: user.sedeId,
              areaId: user.areaId,
              metadata: { date: day, state: "PENDIENTE_JUSTIFICACION" },
            },
            tx,
          );
          await operationalNotification(
            tx,
            user.id,
            "ABSENCE_PROVISIONAL_CREATED",
            { ausenciaId: row.id, plazoLimiteAt: deadline.toISOString() },
          );
          count++;
        }
        await tx.absenceEvaluationProgress.update({
          where: { id: "global" },
          data: {
            afterUserId: users.at(-1)?.id ?? progress.afterUserId,
            completed: users.length < limit,
          },
        });
        return count;
      },
      { isolationLevel: "ReadCommitted", timeout: 60000 },
    );
  }
}
