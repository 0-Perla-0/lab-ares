import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { AuditService } from "../auth/audit.service";
import { operationalNotification } from "../common/domain/operational-notification";
import type { AuthUser } from "../auth/auth-user";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { CalendarService } from "../calendar/calendar.service";
import {
  businessDeadline,
  dateLabel,
  nextDay,
} from "../calendar/calendar-time";
import { localParts } from "../attendance/attendance-risk";
import { AbsenceTransaction } from "./absence-transaction";
import {
  AbsencesRepository,
  absenceInclude,
  type AbsenceRow,
} from "./absences.repository";
import { StorageService } from "../storage/storage.service";
import { issueDownloadCapability } from "../storage/storage.types";
import {
  absenceQuerySchema,
  appealResolutionSchema,
  appealSchema,
  justificationSchema,
  resolutionSchema,
} from "./absences.schemas";

export function absenceScope(
  actor: AuthUser,
  permission: Permission,
): Prisma.AusenciaWhereInput {
  const scope = getAccessScope(actor, permission);
  if (scope === AccessScope.GLOBAL) return {};
  if (scope === AccessScope.SEDE && actor.sedeId)
    return { sedeId: actor.sedeId };
  if (scope === AccessScope.AREA && actor.areaId)
    return { areaId: actor.areaId };
  if (scope === AccessScope.SELF) return { userId: actor.id };
  throw new ApiException("FORBIDDEN", 403);
}
export function requireAbsenceScope(
  actor: AuthUser,
  row: { userId: number; sedeId: number; areaId: number },
  permission: Permission,
) {
  const scope = absenceScope(actor, permission);
  if (
    (scope.userId !== undefined && scope.userId !== row.userId) ||
    (scope.sedeId !== undefined && scope.sedeId !== row.sedeId) ||
    (scope.areaId !== undefined && scope.areaId !== row.areaId)
  )
    throw new ApiException("FORBIDDEN", 403);
}

@Injectable()
export class AbsencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AbsencesRepository,
    private readonly writes: AbsenceTransaction,
    private readonly calendar: CalendarService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async list(
    actor: AuthUser,
    query: z.infer<typeof absenceQuerySchema>,
    queue = false,
  ) {
    const rows = await this.repository.list(
      {
        ...(queue
          ? absenceScope(actor, Permission.ABSENCES_REVIEW)
          : { userId: actor.id }),
        ...(query.estado ? { estado: query.estado } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      query.limit,
    );
    const items = rows.slice(0, query.limit);
    const now = new Date();
    return {
      items: await Promise.all(
        items.map(async (row) => ({
          ...row,
          businessDaysRemaining: await this.remaining(row, now),
        })),
      ),
      nextCursor: rows.length > query.limit ? items.at(-1)!.id : null,
      serverTime: now.toISOString(),
      timeZone: "America/Mexico_City",
    };
  }

  private deadline(row: AbsenceRow) {
    return row.estado === "EN_ACLARACION"
      ? row.aclaracionLimiteAt
      : row.estado === "NO_JUSTIFICADA" && !row.apelacion
        ? row.apelacionLimiteAt
        : row.estado === "PENDIENTE_JUSTIFICACION"
          ? row.plazoLimiteAt
          : null;
  }
  private async remaining(row: AbsenceRow, now: Date) {
    const until = this.deadline(row);
    if (!until) return null;
    if (until < now) return 0;
    let count = 0,
      day = localParts(now).day;
    const last = localParts(until).day;
    for (let i = 0; i < 1096 && day <= last; i++, day = nextDay(day))
      if (
        await this.calendar.isBusinessDay(
          { id: row.userId, sedeId: row.sedeId, areaId: row.areaId },
          day,
        )
      )
        count++;
    return count;
  }

  private async row(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    id: string,
    version: number,
    permission: Permission,
  ) {
    const row = await this.repository.lock(tx, id);
    if (!row) throw new ApiException("ABSENCE_NOT_FOUND", 404);
    if (permission === Permission.ABSENCES_SELF) {
      if (row.userId !== actor.id) throw new ApiException("FORBIDDEN", 403);
    } else {
      requireAbsenceScope(actor, row, permission);
      if (row.userId === actor.id)
        throw new ApiException("ABSENCE_SELF_RESOLUTION", 403);
    }
    if (row.version !== version)
      throw new ApiException("ABSENCE_VERSION_CHANGED", 409);
    if (row.evidenceSuppressedAt)
      throw new ApiException("ABSENCE_EVIDENCE_SUPPRESSED", 409);
    return row;
  }

  private async evidence(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    id?: string,
  ) {
    if (!id) return;
    await tx.$queryRaw`SELECT id FROM Archivo WHERE id = ${id} FOR UPDATE`;
    const file = await tx.archivo.findUnique({ where: { id } });
    if (
      !file ||
      file.propietarioId !== actor.id ||
      file.status !== "DISPONIBLE" ||
      !["application/pdf", "image/jpeg", "image/png"].includes(
        file.detectedMime ?? "",
      ) ||
      file.sizeBytes > 10n * 1024n * 1024n
    )
      throw new ApiException("ABSENCE_EVIDENCE_UNAVAILABLE", 409);
  }

  justify(
    actor: AuthUser,
    key: string,
    id: string,
    input: z.infer<typeof justificationSchema>,
  ) {
    return this.writes.run(
      actor,
      key,
      { action: "ABSENCE_JUSTIFY", id, input },
      async (tx) => {
        const row = await this.row(
          tx,
          actor,
          id,
          input.version,
          Permission.ABSENCES_SELF,
        );
        if (!["PENDIENTE_JUSTIFICACION", "EN_ACLARACION"].includes(row.estado))
          throw new ApiException("ABSENCE_STATE_INVALID", 409);
        const deadline =
          row.estado === "EN_ACLARACION"
            ? row.aclaracionLimiteAt
            : row.plazoLimiteAt;
        if (!deadline || deadline < new Date())
          throw new ApiException("ABSENCE_DEADLINE_EXPIRED", 409);
        await this.evidence(tx, actor, input.archivoId);
        await tx.justificacionAusencia.create({
          data: {
            ausenciaId: id,
            motivo: input.motivo,
            archivoId: input.archivoId,
            solicitadoPor: actor.id,
          },
        });
        return this.transition(
          tx,
          actor,
          row,
          "JUSTIFICACION_ENVIADA",
          "ABSENCE_JUSTIFICATION_SUBMITTED",
          { aclaracionLimiteAt: null },
        );
      },
    );
  }

  resolve(
    actor: AuthUser,
    key: string,
    id: string,
    input: z.infer<typeof resolutionSchema>,
  ) {
    return this.writes.run(
      actor,
      key,
      { action: "ABSENCE_RESOLVE", id, input },
      async (tx) => {
        const row = await this.row(
          tx,
          actor,
          id,
          input.version,
          Permission.ABSENCES_REVIEW,
        );
        if (row.estado !== "JUSTIFICACION_ENVIADA")
          throw new ApiException("ABSENCE_STATE_INVALID", 409);
        const now = new Date();
        const target = {
          id: row.userId,
          sedeId: row.sedeId,
          areaId: row.areaId,
        };
        const deadline = (count: number) =>
          businessDeadline(now, count, (day) =>
            this.calendar.isBusinessDay(target, day, tx),
          );
        return this.transition(
          tx,
          actor,
          row,
          input.decision,
          "ABSENCE_RESOLVED",
          {
            motivoResolucion: input.motivo,
            resueltoPorId: actor.id,
            aclaracionLimiteAt:
              input.decision === "EN_ACLARACION" ? await deadline(2) : null,
            apelacionLimiteAt:
              input.decision === "NO_JUSTIFICADA" ? await deadline(3) : null,
          },
        );
      },
    );
  }

  appeal(
    actor: AuthUser,
    key: string,
    id: string,
    input: z.infer<typeof appealSchema>,
  ) {
    return this.writes.run(
      actor,
      key,
      { action: "ABSENCE_APPEAL", id, input },
      async (tx) => {
        const row = await this.row(
          tx,
          actor,
          id,
          input.version,
          Permission.ABSENCES_SELF,
        );
        if (row.estado !== "NO_JUSTIFICADA" || row.apelacion)
          throw new ApiException("ABSENCE_STATE_INVALID", 409);
        if (!row.apelacionLimiteAt || row.apelacionLimiteAt < new Date())
          throw new ApiException("ABSENCE_DEADLINE_EXPIRED", 409);
        await this.evidence(tx, actor, input.archivoId);
        await tx.apelacionAusencia.create({
          data: {
            ausenciaId: id,
            argumento: input.argumento,
            archivoId: input.archivoId,
          },
        });
        return this.transition(
          tx,
          actor,
          row,
          "EN_APELACION",
          "ABSENCE_APPEAL_SUBMITTED",
          {},
        );
      },
    );
  }

  resolveAppeal(
    actor: AuthUser,
    key: string,
    id: string,
    input: z.infer<typeof appealResolutionSchema>,
  ) {
    return this.writes.run(
      actor,
      key,
      { action: "ABSENCE_APPEAL_RESOLVE", id, input },
      async (tx) => {
        const row = await this.row(
          tx,
          actor,
          id,
          input.version,
          Permission.ABSENCES_APPEAL_RESOLVE,
        );
        if (
          row.estado !== "EN_APELACION" ||
          !row.apelacion ||
          row.apelacion.resolvedAt
        )
          throw new ApiException("ABSENCE_STATE_INVALID", 409);
        if (row.resueltoPorId === actor.id)
          throw new ApiException("ABSENCE_INDEPENDENT_REVIEW_REQUIRED", 403);
        // The original reviewer can differ, but the appeal authority must not be junior.
        const reviewer = row.resueltoPorId
          ? await tx.usuario.findUnique({
              where: { id: row.resueltoPorId },
              select: { rol: true },
            })
          : null;
        const hierarchy = {
          PRESTADOR: 0,
          COORDINADOR: 1,
          JEFE_AREA: 2,
          JEFE_SEDE: 3,
          JEFE_COORDINADORES: 4,
          ADMIN: 5,
        };
        if (reviewer && hierarchy[actor.rol] < hierarchy[reviewer.rol])
          throw new ApiException("ABSENCE_INDEPENDENT_REVIEW_REQUIRED", 403);
        await tx.apelacionAusencia.update({
          where: { id: row.apelacion.id },
          data: {
            resueltoPorId: actor.id,
            resolucion: input.motivo,
            resolvedAt: new Date(),
          },
        });
        return this.transition(
          tx,
          actor,
          row,
          input.decision,
          "ABSENCE_APPEAL_RESOLVED",
          { apelacionLimiteAt: null },
        );
      },
    );
  }

  private async transition(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    row: AbsenceRow,
    estado: AbsenceRow["estado"],
    action:
      | "ABSENCE_JUSTIFICATION_SUBMITTED"
      | "ABSENCE_RESOLVED"
      | "ABSENCE_APPEAL_SUBMITTED"
      | "ABSENCE_APPEAL_RESOLVED",
    data: Prisma.AusenciaUncheckedUpdateInput,
  ) {
    const result = await tx.ausencia.update({
      where: { id: row.id },
      data: { ...data, estado, version: { increment: 1 } },
      include: absenceInclude,
    });
    // Never copy medical/legal narratives, names or file paths into the audit log.
    await this.audit.append(
      {
        actorId: actor.id,
        actorRole: actor.rol,
        subjectId: row.userId,
        action,
        resource: "absences",
        objectId: row.id,
        sedeId: row.sedeId,
        areaId: row.areaId,
        metadata: {
          previousState: row.estado,
          state: estado,
          version: result.version,
          date: dateLabel(row.fecha),
        },
      },
      tx,
    );
    await operationalNotification(tx, row.userId, action, {
      ausenciaId: row.id,
      estado,
    });
    return result;
  }

  async download(actor: AuthUser, id: string, archivoId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${actor.id} FOR UPDATE`;
        const fresh = await tx.usuario.findUnique({ where: { id: actor.id } });
        if (
          !fresh ||
          fresh.estado !== "ACTIVA" ||
          fresh.rol !== actor.rol ||
          fresh.areaId !== actor.areaId ||
          fresh.sedeId !== actor.sedeId
        )
          throw new ApiException("UNAUTHORIZED", 401);
        const row = await this.repository.lock(tx, id);
        if (!row) throw new ApiException("ABSENCE_NOT_FOUND", 404);
        if (row.userId !== actor.id)
          requireAbsenceScope(actor, row, Permission.ABSENCES_REVIEW);
        if (
          !row.justificaciones.some((j) => j.archivoId === archivoId) &&
          row.apelacion?.archivoId !== archivoId
        )
          throw new ApiException("ABSENCE_NOT_FOUND", 404);
        await tx.$queryRaw`SELECT id FROM Archivo WHERE id = ${archivoId} FOR UPDATE`;
        const file = await tx.archivo.findUnique({
          where: { id: archivoId },
          select: { status: true },
        });
        if (file?.status !== "DISPONIBLE")
          throw new ApiException("ABSENCE_EVIDENCE_UNAVAILABLE", 409);
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: row.userId,
            resource: "absences",
            action: "ABSENCE_EVIDENCE_DOWNLOADED",
            objectId: id,
            sedeId: row.sedeId,
            areaId: row.areaId,
          },
          tx,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
    return this.storage.downloadUrl(
      archivoId,
      issueDownloadCapability({
        subjectId: String(actor.id),
        resourceId: archivoId,
        purpose: "download",
        issuedAt: new Date(),
      }),
      String(actor.id),
    );
  }
}
