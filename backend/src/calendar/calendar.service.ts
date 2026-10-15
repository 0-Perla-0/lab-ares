import { Injectable } from "@nestjs/common";
import { operationalNotification } from "../common/domain/operational-notification";
import type { AuthUser } from "../auth/auth-user";
import { AuditService } from "../auth/audit.service";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../database/prisma.service";
import { Prisma, type ExcepcionCalendario } from "../generated/prisma/client";
import { AbsenceTransaction, hashJson } from "../absences/absence-transaction";
import {
  dateColumn,
  dateLabel,
  mexicoInstant,
  nextDay,
  weekday,
} from "./calendar-time";
import { localParts } from "../attendance/attendance-risk";
import type { ExceptionInput } from "./calendar.schemas";

type Target = { id: number; sedeId: number | null; areaId: number | null };
const rank = { GLOBAL: 0, SEDE: 1, AREA: 2, USUARIO: 3 };
export function chooseException(rows: ExcepcionCalendario[]) {
  return [...rows].sort(
    (a, b) =>
      rank[b.alcance] - rank[a.alcance] ||
      +b.createdAt - +a.createdAt ||
      b.id.localeCompare(a.id),
  )[0];
}
export function exceptionIsWorkDay(
  exception: Pick<ExcepcionCalendario, "efecto">,
) {
  return !["SUSPENSION_ACTIVIDADES", "PERMISO_PROGRAMADO"].includes(
    exception.efecto,
  );
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: AbsenceTransaction,
    private readonly audit: AuditService,
  ) {}

  async exceptionFor(
    target: Target,
    day: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    return chooseException(
      await db.excepcionCalendario.findMany({
        where: {
          revokedAt: null,
          fechaInicio: { lte: dateColumn(day) },
          fechaFin: { gte: dateColumn(day) },
          OR: [
            { alcance: "GLOBAL" },
            ...(target.sedeId
              ? [{ alcance: "SEDE" as const, sedeId: target.sedeId }]
              : []),
            ...(target.areaId
              ? [{ alcance: "AREA" as const, areaId: target.areaId }]
              : []),
            { alcance: "USUARIO", usuarioId: target.id },
          ],
        },
      }),
    );
  }

  async isWorkDay(
    userId: number,
    date: Date,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const user = await db.usuario.findUnique({
      where: { id: userId },
      include: { sede: true, area: true, turno: { include: { dias: true } } },
    });
    if (
      !user ||
      user.estado !== "ACTIVA" ||
      !user.sede?.activa ||
      !user.area?.activa ||
      !user.turno?.activo ||
      user.area.sedeId !== user.sedeId ||
      user.turno.areaId !== user.areaId
    )
      return { isWorkDay: false };
    const day = localParts(date).day;
    const exception = await this.exceptionFor(user, day, db);
    return {
      isWorkDay: exception
        ? exceptionIsWorkDay(exception)
        : user.turno.dias.some((d) => d.dia === weekday(day)),
      exception,
    };
  }

  async isBusinessDay(
    target: Target,
    day: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // Legal business days do not depend on a student's part-time shift.
    if (["SABADO", "DOMINGO"].includes(weekday(day))) return false;
    const exception = await this.exceptionFor(target, day, db);
    return !exception || exceptionIsWorkDay(exception);
  }

  async events(actor: AuthUser, from: string, to: string) {
    const scope = getAccessScope(actor, Permission.CALENDAR_READ);
    if (!scope) throw new ApiException("FORBIDDEN", 403);
    const own: Prisma.ExcepcionCalendarioWhereInput[] = [
      { alcance: "GLOBAL" },
      { usuarioId: actor.id },
      ...(actor.sedeId
        ? [{ alcance: "SEDE" as const, sedeId: actor.sedeId }]
        : []),
      ...(actor.areaId
        ? [{ alcance: "AREA" as const, areaId: actor.areaId }]
        : []),
    ];
    if (scope === AccessScope.AREA && actor.areaId)
      own.push({ areaId: actor.areaId }, { usuario: { areaId: actor.areaId } });
    if (scope === AccessScope.SEDE && actor.sedeId)
      own.push(
        { sedeId: actor.sedeId },
        { area: { sedeId: actor.sedeId } },
        { usuario: { sedeId: actor.sedeId } },
      );
    const rows = await this.prisma.excepcionCalendario.findMany({
      where: {
        revokedAt: null,
        fechaInicio: { lte: dateColumn(to) },
        fechaFin: { gte: dateColumn(from) },
        ...(scope !== AccessScope.GLOBAL ? { OR: own } : {}),
      },
      take: 501,
      orderBy: [{ fechaInicio: "asc" }, { id: "asc" }],
    });
    if (rows.length > 500)
      throw new ApiException("CALENDAR_RANGE_TOO_LARGE", 400);
    // Private reasons for a personal permit are only visible to its owner/managers.
    const shift = await this.prisma.turno.findUnique({
      where: { id: actor.turnoId ?? -1 },
      include: { dias: true },
    });
    return {
      items: rows.map((r) => ({
        ...r,
        motivo:
          r.alcance === "USUARIO" &&
          r.usuarioId !== actor.id &&
          scope === AccessScope.SELF
            ? null
            : r.motivo,
      })),
      shift: shift
        ? {
            start: shift.horaInicio.toISOString().slice(11, 19),
            end: shift.horaFin.toISOString().slice(11, 19),
            days: shift.dias.map((d) => d.dia),
          }
        : null,
    };
  }

  private async requireTarget(
    actor: AuthUser,
    input: Pick<ExceptionInput, "alcance" | "sedeId" | "areaId" | "usuarioId">,
    db: Prisma.TransactionClient,
  ) {
    const scope = getAccessScope(actor, Permission.CALENDAR_MANAGE);
    if (!scope || scope === AccessScope.SELF)
      throw new ApiException("FORBIDDEN", 403);
    let target: Target | undefined;
    if (input.alcance === "GLOBAL") {
      if (scope !== AccessScope.GLOBAL)
        throw new ApiException("FORBIDDEN", 403);
      return;
    }
    if (input.alcance === "USUARIO")
      target =
        (await db.usuario.findUnique({
          where: { id: input.usuarioId },
          select: { id: true, sedeId: true, areaId: true },
        })) ?? undefined;
    if (input.alcance === "AREA") {
      const area = await db.area.findUnique({ where: { id: input.areaId } });
      if (area) target = { id: -1, areaId: area.id, sedeId: area.sedeId };
    }
    if (input.alcance === "SEDE") {
      const sede = await db.sede.findUnique({ where: { id: input.sedeId } });
      if (sede) target = { id: -1, sedeId: sede.id, areaId: null };
    }
    if (!target) throw new ApiException("CALENDAR_TARGET_NOT_FOUND", 404);
    if (
      (scope === AccessScope.AREA &&
        (input.alcance === "SEDE" ||
          !actor.areaId ||
          target.areaId !== actor.areaId)) ||
      (scope === AccessScope.SEDE &&
        (!actor.sedeId || target.sedeId !== actor.sedeId))
    )
      throw new ApiException("FORBIDDEN", 403);
  }

  private targetWhere(
    input: Pick<ExceptionInput, "alcance" | "sedeId" | "areaId" | "usuarioId">,
  ) {
    return input.alcance === "USUARIO"
      ? { userId: input.usuarioId }
      : input.alcance === "AREA"
        ? { areaId: input.areaId }
        : input.alcance === "SEDE"
          ? { sedeId: input.sedeId }
          : {};
  }

  private async impact(
    input: ExceptionInput,
    db: Prisma.TransactionClient,
    actor: AuthUser,
  ) {
    const target = this.targetWhere(input);
    const absences = await db.ausencia.findMany({
      where: {
        ...target,
        fecha: {
          gte: dateColumn(input.fechaInicio),
          lte: dateColumn(input.fechaFin),
        },
        estado: { not: "CANCELADA" },
      },
      orderBy: { id: "asc" },
      take: 5001,
    });
    const attendances = await db.asistencia.findMany({
      where: {
        ...target,
        checkInAt: {
          gte: mexicoInstant(input.fechaInicio),
          lt: mexicoInstant(nextDay(input.fechaFin)),
        },
      },
      select: {
        id: true,
        version: true,
        status: true,
        sedeId: true,
        areaId: true,
      },
      orderBy: { id: "asc" },
      take: 5001,
    });
    const users = await db.usuario.findMany({
      where: {
        estado: "ACTIVA",
        ...(input.alcance === "USUARIO"
          ? { id: input.usuarioId }
          : input.alcance === "AREA"
            ? { areaId: input.areaId }
            : input.alcance === "SEDE"
              ? { sedeId: input.sedeId }
              : {}),
      },
      select: { id: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: 5001,
    });
    if ([absences, attendances, users].some((rows) => rows.length > 5000))
      throw new ApiException("CALENDAR_RANGE_TOO_LARGE", 400);
    const scope = getAccessScope(actor, Permission.CALENDAR_MANAGE);
    // Historical records keep their assignment snapshot even after a user moves.
    for (const row of [...absences, ...attendances]) {
      if (
        (scope === AccessScope.AREA && row.areaId !== actor.areaId) ||
        (scope === AccessScope.SEDE && row.sedeId !== actor.sedeId)
      )
        throw new ApiException("FORBIDDEN", 403);
    }
    const revision = await db.calendarRevision.findUniqueOrThrow({
      where: { id: "global" },
    });
    return {
      absences,
      impactHash: hashJson({
        revision: revision.version,
        absences: absences.map((a) => [a.id, a.version]),
        attendances,
        users,
      }),
      counts: {
        users: users.length,
        attendances: attendances.length,
        absences: absences.length,
        definitive: absences.filter((a) =>
          ["JUSTIFICADA", "NO_JUSTIFICADA", "EN_APELACION"].includes(a.estado),
        ).length,
      },
    };
  }

  preview(actor: AuthUser, key: string, input: ExceptionInput) {
    return this.writes.run(
      actor,
      key,
      { action: "CALENDAR_PREVIEW", input },
      async (tx) => {
        await this.requireTarget(actor, input, tx);
        const impact = await this.impact(input, tx, actor);
        const row = await tx.calendarPreview.create({
          data: {
            actorId: actor.id,
            fingerprint: hashJson({ action: "CREATE", input }),
            impactHash: impact.impactHash,
            expiresAt: new Date(Date.now() + 15 * 60000),
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            resource: "calendar",
            action: "CALENDAR_PREVIEW_CREATED",
            objectId: row.id,
            metadata: impact.counts,
          },
          tx,
        );
        return {
          previewId: row.id,
          expiresAt: row.expiresAt,
          ...impact.counts,
          attendanceHoursChanged: false,
        };
      },
    );
  }

  private async confirm(
    actor: AuthUser,
    previewId: string | undefined,
    fingerprint: string,
    impactHash: string,
    definitive: number,
    confirmed: boolean,
    tx: Prisma.TransactionClient,
  ) {
    if (!previewId) throw new ApiException("CALENDAR_PREVIEW_REQUIRED", 409);
    const preview = await tx.calendarPreview.findUnique({
      where: { id: previewId },
    });
    if (
      !preview ||
      preview.actorId !== actor.id ||
      preview.expiresAt <= new Date() ||
      preview.fingerprint !== fingerprint ||
      preview.impactHash !== impactHash
    )
      throw new ApiException("CALENDAR_PREVIEW_STALE", 409);
    if (definitive && (!confirmed || actor.rol !== "ADMIN"))
      throw new ApiException("CALENDAR_ADMIN_CONFIRMATION_REQUIRED", 403);
  }

  create(
    actor: AuthUser,
    key: string,
    input: ExceptionInput,
    previewId?: string,
    confirmDefinitive = false,
  ) {
    return this.writes.run(
      actor,
      key,
      { action: "CALENDAR_CREATE", input, previewId, confirmDefinitive },
      async (tx) => {
        await this.requireTarget(actor, input, tx);
        const impact = await this.impact(input, tx, actor);
        if (input.fechaInicio <= localParts(new Date()).day)
          await this.confirm(
            actor,
            previewId,
            hashJson({ action: "CREATE", input }),
            impact.impactHash,
            impact.counts.definitive,
            confirmDefinitive,
            tx,
          );
        const row = await tx.excepcionCalendario.create({
          data: {
            ...input,
            fechaInicio: dateColumn(input.fechaInicio),
            fechaFin: dateColumn(input.fechaFin),
            creadoPorId: actor.id,
          },
        });
        // Re-evaluate with strict precedence; a lower-scoped suspension cannot cancel a personal work exception.
        for (const absence of impact.absences) {
          const effective = await this.exceptionFor(
            {
              id: absence.userId,
              sedeId: absence.sedeId,
              areaId: absence.areaId,
            },
            dateLabel(absence.fecha),
            tx,
          );
          if (effective && !exceptionIsWorkDay(effective)) {
            await tx.ausencia.update({
              where: { id: absence.id },
              data: {
                estado: "CANCELADA",
                version: { increment: 1 },
                motivoResolucion: "EXCEPCION_CALENDARIO",
                resueltoPorId: actor.id,
              },
            });
            await this.audit.append(
              {
                actorId: actor.id,
                subjectId: absence.userId,
                resource: "absences",
                action: "ABSENCE_CALENDAR_CANCELLED",
                objectId: absence.id,
                sedeId: absence.sedeId,
                areaId: absence.areaId,
                reason:
                  input.alcance === "USUARIO"
                    ? "PERMISO_INDIVIDUAL"
                    : input.motivo,
                metadata: {
                  previousState: absence.estado,
                  exceptionId: row.id,
                },
              },
              tx,
            );
            await operationalNotification(
              tx,
              absence.userId,
              "ABSENCE_CALENDAR_CANCELLED",
              { ausenciaId: absence.id, exceptionId: row.id },
            );
          }
        }
        await tx.calendarRevision.update({
          where: { id: "global" },
          data: { version: { increment: 1 } },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            actorRole: actor.rol,
            resource: "calendar",
            action: "CALENDAR_EXCEPTION_CREATED",
            objectId: row.id,
            reason:
              input.alcance === "USUARIO" ? "PERMISO_INDIVIDUAL" : input.motivo,
            metadata: {
              alcance: row.alcance,
              efecto: row.efecto,
              previewId: previewId ?? null,
              confirmDefinitive,
            },
          },
          tx,
        );
        return row;
      },
    );
  }

  private asInput(row: ExcepcionCalendario): ExceptionInput {
    return {
      titulo: row.titulo,
      motivo: row.motivo,
      tipo: row.tipo,
      efecto: row.efecto,
      alcance: row.alcance,
      sedeId: row.sedeId ?? undefined,
      areaId: row.areaId ?? undefined,
      usuarioId: row.usuarioId ?? undefined,
      fechaInicio: dateLabel(row.fechaInicio),
      fechaFin: dateLabel(row.fechaFin),
      horaInicio: row.horaInicio ?? undefined,
      horaFin: row.horaFin ?? undefined,
    };
  }

  revokePreview(actor: AuthUser, key: string, id: string) {
    return this.writes.run(
      actor,
      key,
      { action: "CALENDAR_REVOKE_PREVIEW", id },
      async (tx) => {
        const row = await tx.excepcionCalendario.findUnique({ where: { id } });
        if (!row || row.revokedAt)
          throw new ApiException("CALENDAR_NOT_FOUND", 404);
        const input = this.asInput(row);
        await this.requireTarget(actor, input, tx);
        const impact = await this.impact(input, tx, actor);
        const preview = await tx.calendarPreview.create({
          data: {
            actorId: actor.id,
            fingerprint: hashJson({ action: "REVOKE", id }),
            impactHash: impact.impactHash,
            expiresAt: new Date(Date.now() + 15 * 60000),
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            resource: "calendar",
            action: "CALENDAR_REVOCATION_PREVIEWED",
            objectId: id,
            metadata: impact.counts,
          },
          tx,
        );
        return {
          previewId: preview.id,
          expiresAt: preview.expiresAt,
          ...impact.counts,
          restoresAbsences: false,
        };
      },
    );
  }

  revoke(
    actor: AuthUser,
    key: string,
    id: string,
    motivo: string,
    previewId?: string,
    confirmDefinitive = false,
  ) {
    return this.writes.run(
      actor,
      key,
      { action: "CALENDAR_REVOKE", id, motivo, previewId, confirmDefinitive },
      async (tx) => {
        const row = await tx.excepcionCalendario.findUnique({ where: { id } });
        if (!row || row.revokedAt)
          throw new ApiException("CALENDAR_NOT_FOUND", 404);
        const input = this.asInput(row);
        await this.requireTarget(actor, input, tx);
        const impact = await this.impact(input, tx, actor);
        if (input.fechaInicio <= localParts(new Date()).day)
          await this.confirm(
            actor,
            previewId,
            hashJson({ action: "REVOKE", id }),
            impact.impactHash,
            impact.counts.definitive,
            confirmDefinitive,
            tx,
          );
        const result = await tx.excepcionCalendario.update({
          where: { id },
          data: { revokedAt: new Date() },
        });
        await tx.calendarRevision.update({
          where: { id: "global" },
          data: { version: { increment: 1 } },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            resource: "calendar",
            action: "CALENDAR_EXCEPTION_REVOKED",
            objectId: id,
            reason: row.alcance === "USUARIO" ? "PERMISO_INDIVIDUAL" : motivo,
            metadata: { previewId: previewId ?? null, absencesRestored: false },
          },
          tx,
        );
        // Revocation never resurrects/cements a historical absence silently.
        return result;
      },
    );
  }
}
