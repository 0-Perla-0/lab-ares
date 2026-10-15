import { createHash } from "node:crypto";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { CalendarService } from "../calendar/calendar.service";
import { ConfigService } from "@nestjs/config";
import { requirePilot } from "../common/domain/operational-pilot";
import type { AuthUser } from "../auth/auth-user";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { AttendancePolicy } from "./attendance.policy";
import type { AttendanceQuery } from "./attendance.schemas";
import { AuditService } from "../auth/audit.service";
import { closeOverdue } from "./attendance-cutoff";
import {
  evaluateSignals,
  signalRisk,
  type SignalInput,
} from "./attendance-signals";
import {
  ATTENDANCE_TIME_ZONE,
  dailyCutoff,
  DEFAULT_RISK_RULES,
  evaluateRisk,
  localParts,
  riskRulesSchema,
  type ShiftSnapshot,
} from "./attendance-risk";

const includeUser = { user: { select: { codigo: true } } } as const;
type AttendanceRow = Prisma.AsistenciaGetPayload<{
  include: typeof includeUser;
}>;
type Operation =
  | { action: "CHECK_IN" }
  | { action: "CHECK_OUT"; attendanceId: number }
  | { action: "MANUAL_CLOSE"; attendanceId: number; reason: string };

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  readonly abnormalAfterSeconds: number;
  readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AttendancePolicy,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Optional() private readonly calendar?: CalendarService,
  ) {
    this.abnormalAfterSeconds =
      config.get<number>("ATTENDANCE_ALERT_HOURS", 12) * 3600;
    this.timeZone = ATTENDANCE_TIME_ZONE;
  }

  async mine(user: AuthUser, query: AttendanceQuery) {
    const now = new Date();
    const [items, open, groups] = await this.prisma.$transaction(
      [
        this.prisma.asistencia.findMany({
          where: {
            userId: user.id,
            ...(query.cursor ? { id: { lt: query.cursor } } : {}),
          },
          orderBy: { id: "desc" },
          take: query.limit + 1,
          include: includeUser,
        }),
        this.prisma.asistencia.findUnique({
          where: { openUserId: user.id },
          include: includeUser,
        }),
        this.prisma.asistencia.groupBy({
          by: ["status"],
          where: {
            userId: user.id,
            status: { not: "ABIERTA" },
            requiresReview: false,
          },
          _sum: { durationSeconds: true },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const sum = (status: string) =>
      groups.find((group) => group.status === status)?._sum.durationSeconds ??
      0;
    return {
      ...this.page(items, query.limit, now),
      open: open ? this.serialize(open, now) : null,
      bank: {
        pendingSeconds: sum("PENDIENTE"),
        authorizedSeconds: sum("AUTORIZADA"),
        rejectedSeconds: sum("RECHAZADA"),
      },
    };
  }

  async open(user: AuthUser, query: AttendanceQuery) {
    const rows = await this.prisma.asistencia.findMany({
      where: {
        ...this.policy.scope(user),
        status: "ABIERTA",
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: query.limit + 1,
      include: includeUser,
    });
    return this.page(rows, query.limit, new Date());
  }

  checkIn(user: AuthUser, key: string, signals: SignalInput = {}) {
    return this.write(user, key, { action: "CHECK_IN" }, signals);
  }
  checkOut(
    user: AuthUser,
    key: string,
    attendanceId: number,
    signals: SignalInput = {},
  ) {
    return this.write(
      user,
      key,
      { action: "CHECK_OUT", attendanceId },
      signals,
    );
  }
  close(user: AuthUser, key: string, attendanceId: number, reason: string) {
    return this.write(user, key, {
      action: "MANUAL_CLOSE",
      attendanceId,
      reason,
    });
  }

  private async write(
    user: AuthUser,
    key: string,
    operation: Operation,
    signals: SignalInput = {},
  ) {
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          ...operation,
          ...(signals.coords !== undefined ? { coords: signals.coords } : {}),
        }),
      )
      .digest("hex");
    // Retries cover deadlocks and concurrent claims of the same idempotency key.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM RecoveryWriteBarrier WHERE id = 'global' LOCK IN SHARE MODE`;
            const barrier = await tx.recoveryWriteBarrier.findUnique({
              where: { id: "global" },
            });
            if (!barrier || barrier.active)
              throw new ApiException("RECOVERY_WRITE_BARRIER_ACTIVE", 503);
            let targetUserId = user.id;
            if (operation.action !== "CHECK_IN") {
              const target = await tx.asistencia.findUnique({
                where: { id: operation.attendanceId },
              });
              if (!target) throw new ApiException("ATTENDANCE_NOT_FOUND", 404);
              if (operation.action === "MANUAL_CLOSE")
                this.policy.requireManage(user, target);
              else if (target.userId !== user.id)
                throw new ApiException("FORBIDDEN", 403);
              targetUserId = target.userId;
            }
            // Serialize check-in, own checkout and manual closure on the SAME user row.
            await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${targetUserId} FOR UPDATE`;
            const previous = await tx.asistenciaSolicitud.findUnique({
              where: { actorId_key: { actorId: user.id, key } },
            });
            if (previous) {
              if (previous.fingerprint !== fingerprint)
                throw new ApiException("IDEMPOTENCY_KEY_REUSED", 409);
              return previous.response;
            }
            const now = new Date();
            let row: AttendanceRow;
            await closeOverdue(tx, targetUserId, now, this.audit);
            if (operation.action === "CHECK_IN") {
              const owner = await tx.usuario.findUnique({
                where: { id: user.id },
                include: {
                  sede: true,
                  area: true,
                  turno: { include: { dias: true } },
                },
              });
              if (!owner || owner.estado !== "ACTIVA")
                throw new ApiException("UNAUTHORIZED", 401);
              requirePilot(this.config, owner);
              if (
                !owner.sede?.activa ||
                !owner.area?.activa ||
                !owner.turno?.activo ||
                owner.area.sedeId !== owner.sede.id ||
                owner.turno.areaId !== owner.area.id
              ) {
                throw new ApiException("ATTENDANCE_ASSIGNMENT_REQUIRED", 409);
              }
              if (owner.turno.horaFin <= owner.turno.horaInicio)
                throw new ApiException("ATTENDANCE_OVERNIGHT_UNSUPPORTED", 409);
              if (now >= dailyCutoff(now))
                throw new ApiException("ATTENDANCE_DAY_CLOSED", 409);
              const policy = await tx.politicaAsistencia.findFirst({
                where: { sedeId: owner.sede.id },
                orderBy: { version: "desc" },
              });
              if (
                await tx.asistencia.findUnique({
                  where: { openUserId: user.id },
                })
              )
                throw new ApiException("ATTENDANCE_ALREADY_OPEN", 409);
              const exception = await this.calendar?.exceptionFor(
                owner,
                localParts(now).day,
                tx,
              );
              const special = exception?.efecto === "HORARIO_ESPECIAL";
              const extraordinary =
                exception?.efecto === "ASISTENCIA_EXTRAORDINARIA";
              row = await tx.asistencia.create({
                data: {
                  userId: user.id,
                  openUserId: user.id,
                  sedeId: owner.sede.id,
                  areaId: owner.area.id,
                  turnoId: owner.turno.id,
                  checkInAt: now,
                  ...evaluateSignals(policy?.locationRules, signals),
                  shiftSnapshot: {
                    start: special
                      ? exception.horaInicio!
                      : owner.turno.horaInicio.toISOString().slice(11, 19),
                    end: special
                      ? exception.horaFin!
                      : owner.turno.horaFin.toISOString().slice(11, 19),
                    days:
                      special || extraordinary
                        ? [localParts(now).weekDay]
                        : owner.turno.dias.map((d) => d.dia),
                    ...(exception
                      ? {
                          exceptionId: exception.id,
                          exceptionEffect: exception.efecto,
                        }
                      : {}),
                  },
                  policySnapshot: {
                    version: policy?.version ?? 0,
                    rules: policy?.rules ?? DEFAULT_RISK_RULES,
                    locationRules: policy?.locationRules ?? {
                      mode: "SIN_VALIDACION",
                    },
                  },
                },
                include: includeUser,
              });
            } else {
              // Read again after acquiring the lock so concurrent closures see committed state.
              const target = await tx.asistencia.findUnique({
                where: { id: operation.attendanceId },
                include: includeUser,
              });
              if (!target || target.status !== "ABIERTA")
                throw new ApiException("ATTENDANCE_NOT_OPEN", 409);
              if (now < target.checkInAt)
                throw new ApiException("ATTENDANCE_CLOCK_ERROR", 409);
              row = await tx.asistencia.update({
                where: { id: target.id },
                data: {
                  checkOutAt: now,
                  openUserId: null,
                  status: "PENDIENTE",
                  durationSeconds: elapsedSeconds(target.checkInAt, now),
                  closedById: user.id,
                  version: { increment: 1 },
                  closeReason:
                    operation.action === "MANUAL_CLOSE"
                      ? operation.reason
                      : null,
                  ...(operation.action === "CHECK_OUT"
                    ? {
                        checkoutSignal: evaluateSignals(
                          (
                            target.policySnapshot as {
                              locationRules?: unknown;
                            } | null
                          )?.locationRules,
                          signals,
                        ),
                      }
                    : {}),
                },
                include: includeUser,
              });
              const risk = this.risk(
                row,
                now,
                operation.action === "MANUAL_CLOSE",
              );
              row = await tx.asistencia.update({
                where: { id: row.id },
                data: { riskSnapshot: risk },
                include: includeUser,
              });
            }
            await tx.asistenciaEvento.create({
              data: {
                attendanceId: row.id,
                actorId: user.id,
                action: operation.action,
                occurredAt: now,
                reason:
                  operation.action === "MANUAL_CLOSE" ? operation.reason : null,
              },
            });
            await this.audit.append(
              {
                actorId: user.id,
                actorRole: user.rol,
                subjectId: row.userId,
                action: `ATTENDANCE_${operation.action}`,
                resource: "attendance",
                objectId: String(row.id),
                sedeId: row.sedeId,
                areaId: row.areaId,
                metadata: { version: row.version, status: row.status },
                reason:
                  operation.action === "MANUAL_CLOSE"
                    ? operation.reason
                    : undefined,
              },
              tx,
            );
            const response = this.serialize(row, now);
            await tx.asistenciaSolicitud.create({
              data: { actorId: user.id, key, fingerprint, response },
            });
            return response;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 10000,
            timeout: 15000,
          },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2034", "P2002"].includes(error.code)
        ) {
          if (attempt < 2) continue;
          this.logger.warn("Attendance write contention exhausted retries");
          throw new ApiException("ATTENDANCE_RETRY_REQUIRED", 409);
        }
        throw error;
      }
    }
    throw new ApiException("ATTENDANCE_RETRY_REQUIRED", 409);
  }

  private page(rows: AttendanceRow[], limit: number, now: Date) {
    const items = rows.slice(0, limit);
    return {
      items: items.map((row) => this.serialize(row, now)),
      nextCursor: rows.length > limit ? items.at(-1)!.id : null,
      serverTime: now.toISOString(),
      timeZone: this.timeZone,
      abnormalAfterSeconds: this.abnormalAfterSeconds,
    };
  }

  private serialize(row: AttendanceRow, now: Date) {
    return {
      id: row.id,
      userId: row.userId,
      user: row.user,
      sedeId: row.sedeId,
      areaId: row.areaId,
      turnoId: row.turnoId,
      checkInAt: row.checkInAt.toISOString(),
      checkOutAt: row.checkOutAt?.toISOString() ?? null,
      durationSeconds: row.durationSeconds,
      status: row.status,
      closeReason: row.closeReason,
      closedById: row.closedById,
      version: row.version,
      requiresReview: row.requiresReview,
      isContingency: row.isContingency,
      locationRiskCode: row.locationRiskCode,
      risk: this.risk(row, now),
      abnormal:
        row.status === "ABIERTA" &&
        elapsedSeconds(row.checkInAt, now) >= this.abnormalAfterSeconds,
    };
  }
  private risk(row: AttendanceRow, now: Date, corrected = false) {
    const policy = row.policySnapshot as {
      version?: number;
      rules?: unknown;
    } | null;
    const prior = row.riskSnapshot as { reasons?: string[] } | null;
    const rules = riskRulesSchema.safeParse(
      policy?.rules ?? DEFAULT_RISK_RULES,
    );
    return signalRisk(
      evaluateRisk({
        start: row.checkInAt,
        end: row.checkOutAt ?? now,
        omitted: row.requiresReview,
        corrected:
          corrected || (prior?.reasons?.includes("SESION_CORREGIDA") ?? false),
        shift: row.shiftSnapshot as ShiftSnapshot | null,
        policyVersion: policy?.version ?? 0,
        rules: rules.success ? rules.data : DEFAULT_RISK_RULES,
      }),
      [
        row.locationRiskCode,
        (row.checkoutSignal as { locationRiskCode?: string } | null)
          ?.locationRiskCode,
        row.isContingency ? "CAPTURA_CONTINGENCIA" : null,
      ],
    );
  }
}

export function elapsedSeconds(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}
