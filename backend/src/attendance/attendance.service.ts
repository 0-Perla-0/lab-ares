import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthUser } from "../auth/auth-user";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { AttendancePolicy } from "./attendance.policy";
import type { AttendanceQuery } from "./attendance.schemas";

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
    config: ConfigService,
  ) {
    this.abnormalAfterSeconds =
      config.get<number>("ATTENDANCE_ALERT_HOURS", 12) * 3600;
    this.timeZone = config.get<string>("APP_TIME_ZONE", "America/Mexico_City");
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
          where: { userId: user.id, status: { not: "ABIERTA" } },
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

  checkIn(user: AuthUser, key: string) {
    return this.write(user, key, { action: "CHECK_IN" });
  }
  checkOut(user: AuthUser, key: string, attendanceId: number) {
    return this.write(user, key, { action: "CHECK_OUT", attendanceId });
  }
  close(user: AuthUser, key: string, attendanceId: number, reason: string) {
    return this.write(user, key, {
      action: "MANUAL_CLOSE",
      attendanceId,
      reason,
    });
  }

  private async write(user: AuthUser, key: string, operation: Operation) {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(operation))
      .digest("hex");
    // Retries cover deadlocks and concurrent claims of the same idempotency key.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
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
            if (operation.action === "CHECK_IN") {
              const owner = await tx.usuario.findUnique({
                where: { id: user.id },
                include: { sede: true, area: true, turno: true },
              });
              if (!owner || owner.estado !== "ACTIVO")
                throw new ApiException("UNAUTHORIZED", 401);
              if (
                !owner.sede?.activa ||
                !owner.area?.activa ||
                !owner.turno?.activo ||
                owner.area.sedeId !== owner.sede.id ||
                owner.turno.areaId !== owner.area.id
              ) {
                throw new ApiException("ATTENDANCE_ASSIGNMENT_REQUIRED", 409);
              }
              if (
                await tx.asistencia.findUnique({
                  where: { openUserId: user.id },
                })
              )
                throw new ApiException("ATTENDANCE_ALREADY_OPEN", 409);
              row = await tx.asistencia.create({
                data: {
                  userId: user.id,
                  openUserId: user.id,
                  sedeId: owner.sede.id,
                  areaId: owner.area.id,
                  turnoId: owner.turno.id,
                  checkInAt: now,
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
                  closeReason:
                    operation.action === "MANUAL_CLOSE"
                      ? operation.reason
                      : null,
                },
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
      abnormal:
        row.status === "ABIERTA" &&
        elapsedSeconds(row.checkInAt, now) >= this.abnormalAfterSeconds,
    };
  }
}

export function elapsedSeconds(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}
