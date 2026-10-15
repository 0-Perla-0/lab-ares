import { Injectable, Optional } from "@nestjs/common";
import { FeaturePoliciesService } from "../common/domain/feature-policies.service";
import { randomUUID } from "node:crypto";
import { DomainTransaction } from "../common/domain/domain-transaction";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../auth/audit.service";
import { StorageService } from "../storage/storage.service";
import {
  notFound,
  invalidInput,
  conflict,
} from "../common/errors/domain-error";
import {
  EstadoArchivo,
  EstadoActividadKairos,
  EstadoProyectoKairos,
  RolMiembroProyectoKairos,
  TipoHistorialActividadKairos,
  EstadoUsuario,
} from "../generated/prisma/enums";
import type { AuthUser } from "../auth/auth-user";
import type { ActivityInput, ActivityUpdate } from "./activities.schemas";
import { GamificationService } from "../gamification/gamification.service";
const detail = {
  id: true,
  proyectoId: true,
  title: true,
  description: true,
  startAt: true,
  dueAt: true,
  closedAt: true,
  priority: true,
  complexity: true,
  state: true,
  responsable: { select: { id: true, codigo: true } },
  participants: { select: { usuario: { select: { id: true, codigo: true } } } },
  createdAt: true,
  updatedAt: true,
} as const;
@Injectable()
export class KairosActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly gamification: GamificationService = null as any,
    @Optional() private readonly features?: FeaturePoliciesService,
  ) {}
  private active(a: AuthUser) {
    if (!a || a.estado !== "ACTIVA")
      throw notFound("KAIROS_ACTIVITY_NOT_FOUND");
  }
  private manage(role: any) {
    return (
      role === RolMiembroProyectoKairos.PROPIETARIO ||
      role === RolMiembroProyectoKairos.SUBLIDER
    );
  }
  private mutate<T>(
    actor: AuthUser,
    projectId: string,
    key: string,
    operation: object,
    apply: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return new DomainTransaction(this.prisma).run(
      actor,
      key,
      { projectId, ...operation },
      async (tx) => {
        const intent = operation as { action: string; state?: string };
        // Cancellation remains available to close existing work; a replay is read
        // under current membership and never creates work under a paused policy.
        if (!(
          intent.action === "ACTIVITY_TRANSITION" &&
          intent.state === "CANCELADA"
        ))
          await this.features?.requireInTransaction(
            tx,
            "KAIROS.ACTIVITY",
            actor,
          );
        return apply(tx);
      },
      async (tx) => {
        await tx.$queryRaw`SELECT proyectoId FROM MiembroProyectoKairos WHERE proyectoId = ${projectId} AND usuarioId = ${actor.id} FOR UPDATE`;
        const member = await tx.miembroProyectoKairos.findFirst({
          where: {
            proyectoId: projectId,
            usuarioId: actor.id,
            removedAt: null,
          },
        });
        if (!member) throw notFound("KAIROS_PROJECT_NOT_FOUND");
      },
    );
  }
  private async lock(
    tx: any,
    projectId: string,
    id: string,
    actor: AuthUser,
    mutation = true,
  ) {
    this.active(actor);
    await tx.$executeRaw`SELECT id FROM ActividadKairos WHERE id=${id} AND proyectoId=${projectId} FOR UPDATE`;
    const a = await tx.actividadKairos.findFirst({
      where: { id, proyectoId: projectId },
      select: {
        ...detail,
        responsableId: true,
        proyecto: { select: { estado: true } },
      },
    });
    if (!a) throw notFound("KAIROS_ACTIVITY_NOT_FOUND");
    await tx.$executeRaw`SELECT proyectoId FROM MiembroProyectoKairos WHERE proyectoId=${projectId} AND usuarioId=${actor.id} FOR UPDATE`;
    const m = await tx.miembroProyectoKairos.findFirst({
      where: { proyectoId: projectId, usuarioId: actor.id, removedAt: null },
    });
    if (!m) throw notFound("KAIROS_ACTIVITY_NOT_FOUND");
    if (mutation && a.proyecto.estado === EstadoProyectoKairos.ARCHIVADO)
      throw conflict("KAIROS_PROJECT_ARCHIVED");
    return { a, m };
  }
  private async validatePeople(
    tx: any,
    projectId: string,
    responsableId: number,
    participantIds: number[],
  ) {
    const ids = [responsableId, ...participantIds];
    if (new Set(ids).size !== ids.length)
      throw invalidInput("KAIROS_MEMBER_INVALID");
    const ordered = [...new Set(ids)].sort((a, b) => a - b);
    for (const id of ordered)
      await tx.$executeRaw`SELECT proyectoId,usuarioId FROM MiembroProyectoKairos WHERE proyectoId=${projectId} AND usuarioId=${id} FOR UPDATE`;
    const users = await tx.usuario.findMany({
      where: { id: { in: ordered }, estado: EstadoUsuario.ACTIVA },
      select: { id: true },
    });
    const members = await tx.miembroProyectoKairos.findMany({
      where: {
        proyectoId: projectId,
        usuarioId: { in: ordered },
        removedAt: null,
      },
      select: { usuarioId: true },
    });
    if (users.length !== ordered.length || members.length !== ordered.length)
      throw invalidInput("KAIROS_MEMBER_INVALID");
  }
  private async hist(tx: any, activityId: string, actorId: number, data: any) {
    const history = await tx.historialActividadKairos.create({
      data: { actividadId: activityId, actorId, ...data },
    });
    await this.audit.append(
      {
        actorId,
        action:
          data.type === "REVISION" ? "REVIEW_ACTIVITY" : "ACTIVITY_MUTATION",
        resource: "KAIROS_ACTIVITY",
        correlationId: activityId,
        metadata: data,
      },
      tx,
    );
    return history;
  }
  async create(
    actor: AuthUser,
    pid: string,
    input: ActivityInput,
    key: string = randomUUID(),
  ) {
    this.active(actor);
    return this.mutate(
      actor,
      pid,
      key,
      { action: "ACTIVITY_CREATE", input },
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM ProyectoKairos WHERE id=${pid} FOR UPDATE`;
        await tx.$executeRaw`SELECT proyectoId FROM MiembroProyectoKairos WHERE proyectoId=${pid} AND usuarioId=${actor.id} FOR UPDATE`;
        const m = await tx.miembroProyectoKairos.findFirst({
          where: { proyectoId: pid, usuarioId: actor.id, removedAt: null },
        });
        const p = await tx.proyectoKairos.findUnique({
          where: { id: pid },
          select: { estado: true },
        });
        if (
          !m ||
          !p ||
          p.estado === EstadoProyectoKairos.ARCHIVADO ||
          !this.manage(m.rol)
        )
          throw notFound("KAIROS_PROJECT_NOT_FOUND");
        const { participantIds = [], ...data } = input;
        await this.validatePeople(tx, pid, input.responsableId, participantIds);
        await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${input.responsableId} LOCK IN SHARE MODE`;
        const responsible = await tx.usuario.findUnique({
          where: { id: input.responsableId },
          select: { estado: true, sedeId: true, areaId: true },
        });
        if (!responsible || responsible.estado !== EstadoUsuario.ACTIVA)
          throw invalidInput("KAIROS_MEMBER_INVALID");
        const a = await tx.actividadKairos.create({
          data: {
            ...data,
            proyectoId: pid,
            reportSedeId: responsible.sedeId,
            reportAreaId: responsible.areaId,
            reportSnapshotAt: new Date(),
            participants: {
              create: participantIds.map((usuarioId) => ({ usuarioId })),
            },
          },
          select: detail,
        });
        await this.hist(tx, a.id, actor.id, {
          type: TipoHistorialActividadKairos.TRANSICION,
          toState: EstadoActividadKairos.PENDIENTE,
        });
        return a;
      },
    );
  }
  async list(actor: AuthUser, pid: string, page = 1, pageSize = 50) {
    this.active(actor);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM ProyectoKairos WHERE id=${pid} FOR UPDATE`;
      await tx.$executeRaw`SELECT proyectoId FROM MiembroProyectoKairos WHERE proyectoId=${pid} AND usuarioId=${actor.id} FOR UPDATE`;
      const m = await tx.miembroProyectoKairos.findFirst({
        where: { proyectoId: pid, usuarioId: actor.id, removedAt: null },
      });
      if (!m) throw notFound("KAIROS_PROJECT_NOT_FOUND");
      const take = Math.min(Math.max(pageSize, 1), 100);
      const currentPage = Math.min(Math.max(page, 1), 10000);
      const where = { proyectoId: pid };
      const [items, total] = await Promise.all([
        tx.actividadKairos.findMany({
          where,
          select: detail,
          orderBy: { createdAt: "desc" },
          skip: (currentPage - 1) * take,
          take,
        }),
        tx.actividadKairos.count({ where }),
      ]);
      return {
        items: items.map((x) => ({
          ...x,
          vencida:
            !!x.dueAt &&
            x.dueAt < new Date() &&
            !["TERMINADA", "CANCELADA"].includes(x.state as string),
        })),
        total,
        page: currentPage,
        pageSize: take,
      };
    });
  }
  async get(actor: AuthUser, projectId: string, id: string) {
    this.active(actor);
    return this.prisma.$transaction(async (tx) => {
      const { a } = await this.lock(tx, projectId, id, actor, false);
      return {
        ...a,
        vencida:
          !!a.dueAt &&
          a.dueAt < new Date() &&
          !["TERMINADA", "CANCELADA"].includes(a.state as string),
      };
    });
  }
  async update(
    actor: AuthUser,
    projectId: string,
    id: string,
    input: ActivityUpdate,
    key: string = randomUUID(),
  ) {
    this.active(actor);
    return this.mutate(
      actor,
      projectId,
      key,
      { action: "ACTIVITY_UPDATE", id, input },
      async (tx) => {
        const { a, m } = await this.lock(tx, projectId, id, actor);
        if (!this.manage(m.rol) || a.state !== EstadoActividadKairos.PENDIENTE)
          throw invalidInput("KAIROS_ACTIVITY_EDIT_FORBIDDEN");
        const current = await tx.participanteActividadKairos.findMany({
          where: { actividadId: id },
          select: { usuarioId: true },
        });
        const participantIds =
          input.participantIds ?? current.map((x) => x.usuarioId);
        const responsableId = input.responsableId ?? a.responsableId;
        await this.validatePeople(
          tx,
          a.proyectoId,
          responsableId,
          participantIds,
        );
        const { participantIds: _, ...data } = input;
        const out = await tx.actividadKairos.update({
          where: { id },
          data,
          select: detail,
        });
        if (input.participantIds) {
          await tx.participanteActividadKairos.deleteMany({
            where: { actividadId: id },
          });
          for (const usuarioId of participantIds)
            await tx.participanteActividadKairos.create({
              data: { actividadId: id, usuarioId },
            });
        }
        await this.hist(tx, id, actor.id, {
          type: TipoHistorialActividadKairos.TRANSICION,
          comment: "updated",
        });
        return out;
      },
    );
  }
  private allowed(from: any, to: any) {
    return (
      {
        PENDIENTE: ["EN_PROGRESO", "CANCELADA"],
        EN_PROGRESO: ["BLOQUEADA", "EN_REVISION", "CANCELADA"],
        BLOQUEADA: ["EN_PROGRESO", "CANCELADA"],
        REQUIERE_CORRECCION: ["EN_PROGRESO", "EN_REVISION"],
      } as any
    )[from]?.includes(to);
  }
  async transition(
    actor: AuthUser,
    projectId: string,
    id: string,
    state: any,
    comment?: string,
    key: string = randomUUID(),
  ) {
    return this.mutate(
      actor,
      projectId,
      key,
      { action: "ACTIVITY_TRANSITION", id, state, comment },
      async (tx) => {
        const { a, m } = await this.lock(tx, projectId, id, actor);
        if (
          !this.allowed(a.state, state) ||
          (!this.manage(m.rol) && a.responsableId !== actor.id)
        )
          throw invalidInput("KAIROS_ACTIVITY_TRANSITION_INVALID");
        const out = await tx.actividadKairos.update({
          where: { id },
          data: {
            state,
            closedAt:
              state === "TERMINADA" || state === "CANCELADA"
                ? new Date()
                : null,
          },
          select: detail,
        });
        await this.hist(tx, id, actor.id, {
          type: TipoHistorialActividadKairos.TRANSICION,
          fromState: a.state,
          toState: state,
          comment,
        });
        return out;
      },
    );
  }
  async submit(
    actor: AuthUser,
    projectId: string,
    id: string,
    fileId: string,
    comment?: string,
    key: string = randomUUID(),
  ) {
    return this.mutate(
      actor,
      projectId,
      key,
      { action: "ACTIVITY_SUBMIT", id, fileId, comment },
      async (tx) => {
        const { a, m } = await this.lock(tx, projectId, id, actor);
        if (
          (a.responsableId !== actor.id && !this.manage(m.rol)) ||
          !["EN_PROGRESO", "REQUIERE_CORRECCION"].includes(a.state as string)
        )
          throw invalidInput("KAIROS_ACTIVITY_SUBMIT_INVALID");
        await tx.$executeRaw`SELECT id FROM Archivo WHERE id=${fileId} FOR UPDATE`;
        const f = await tx.archivo.findUnique({
          where: { id: fileId },
          select: { id: true, status: true, propietarioId: true },
        });
        if (
          !f ||
          f.status !== EstadoArchivo.DISPONIBLE ||
          f.propietarioId !== actor.id
        )
          throw invalidInput("KAIROS_EVIDENCE_INVALID");
        const last = await tx.entregaEvidenciaKairos.aggregate({
          where: { actividadId: id },
          _max: { version: true },
        });
        const e = await tx.entregaEvidenciaKairos.create({
          data: {
            actividadId: id,
            archivoId: fileId,
            authorId: actor.id,
            version: (last._max.version ?? 0) + 1,
            comment,
          },
        });
        await tx.actividadKairos.update({
          where: { id },
          data: { state: EstadoActividadKairos.EN_REVISION },
        });
        await this.hist(tx, id, actor.id, {
          type: TipoHistorialActividadKairos.ENTREGA,
          fromState: a.state,
          toState: EstadoActividadKairos.EN_REVISION,
          evidenceId: e.id,
          comment,
        });
        return e;
      },
    );
  }
  async review(
    actor: AuthUser,
    projectId: string,
    id: string,
    state: any,
    comment?: string,
    key: string = randomUUID(),
  ) {
    return this.mutate(
      actor,
      projectId,
      key,
      { action: "ACTIVITY_REVIEW", id, state, comment },
      async (tx) => {
        const { a, m } = await this.lock(tx, projectId, id, actor);
        if (
          !this.manage(m.rol) ||
          a.state !== EstadoActividadKairos.EN_REVISION ||
          a.responsableId === actor.id
        )
          throw invalidInput("KAIROS_ACTIVITY_REVIEW_INVALID");
        if (state === "REQUIERE_CORRECCION" && !comment)
          throw invalidInput("KAIROS_REVIEW_COMMENT_REQUIRED");
        const out = await tx.actividadKairos.update({
          where: { id },
          data: { state, closedAt: state === "TERMINADA" ? new Date() : null },
          select: detail,
        });
        const history = await this.hist(tx, id, actor.id, {
          type: TipoHistorialActividadKairos.REVISION,
          fromState: a.state,
          toState: state,
          comment,
          reviewerId: actor.id,
        });
        if (state === EstadoActividadKairos.TERMINADA)
          await this.gamification?.awardKairos(tx, {
            activityId: id,
            userId: a.responsableId,
            actorId: actor.id,
            historyId: history.id,
          });
        return out;
      },
    );
  }
  async reopen(
    actor: AuthUser,
    projectId: string,
    id: string,
    reason: string,
    key: string = randomUUID(),
  ) {
    return this.mutate(
      actor,
      projectId,
      key,
      { action: "ACTIVITY_REOPEN", id, reason },
      async (tx) => {
        const { a, m } = await this.lock(tx, projectId, id, actor);
        if (
          !this.manage(m.rol) ||
          !["TERMINADA", "CANCELADA"].includes(a.state as string)
        )
          throw invalidInput("KAIROS_ACTIVITY_REOPEN_INVALID");
        const out = await tx.actividadKairos.update({
          where: { id },
          data: { state: EstadoActividadKairos.PENDIENTE, closedAt: null },
          select: detail,
        });
        const history = await this.hist(tx, id, actor.id, {
          type: TipoHistorialActividadKairos.REAPERTURA,
          fromState: a.state,
          toState: EstadoActividadKairos.PENDIENTE,
          comment: reason,
        });
        if (a.state === EstadoActividadKairos.TERMINADA)
          await this.gamification?.reverseKairos(tx, {
            activityId: id,
            actorId: actor.id,
            historyId: history.id,
            reason,
          });
        return out;
      },
    );
  }
  async comment(
    actor: AuthUser,
    projectId: string,
    id: string,
    body: string,
    key: string = randomUUID(),
  ) {
    this.active(actor);
    return this.mutate(
      actor,
      projectId,
      key,
      { action: "ACTIVITY_COMMENT", id, body },
      async (tx) => {
        const { a, m } = await this.lock(tx, projectId, id, actor, true);
        if (m.rol === RolMiembroProyectoKairos.OBSERVADOR)
          throw invalidInput("KAIROS_COMMENT_FORBIDDEN");
        const out = await tx.comentarioActividadKairos.create({
          data: { actividadId: a.id, authorId: actor.id, body },
          select: {
            id: true,
            body: true,
            author: { select: { id: true, codigo: true } },
            createdAt: true,
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            action: "COMMENT_ACTIVITY",
            resource: "KAIROS_ACTIVITY",
            correlationId: a.id,
            metadata: { commentId: out.id },
          },
          tx,
        );
        return out;
      },
    );
  }
  async history(
    actor: AuthUser,
    projectId: string,
    id: string,
    page = 1,
    pageSize = 50,
  ) {
    this.active(actor);
    return this.prisma.$transaction(async (tx) => {
      const { a } = await this.lock(tx, projectId, id, actor, false);
      const take = Math.min(Math.max(pageSize, 1), 100);
      const currentPage = Math.min(Math.max(page, 1), 10000);
      const where = { actividadId: a.id };
      const [items, total] = await Promise.all([
        tx.historialActividadKairos.findMany({
          where,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip: (currentPage - 1) * take,
          take,
          select: {
            id: true,
            actividadId: true,
            actorId: true,
            reviewerId: true,
            type: true,
            fromState: true,
            toState: true,
            comment: true,
            evidenceId: true,
            createdAt: true,
          },
        }),
        tx.historialActividadKairos.count({ where }),
      ]);
      return { items, total, page: currentPage, pageSize: take };
    });
  }
  async evidenceList(
    actor: AuthUser,
    projectId: string,
    id: string,
    page = 1,
    pageSize = 50,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { a } = await this.lock(tx, projectId, id, actor, false);
      const take = Math.min(Math.max(pageSize, 1), 100);
      const skip = (Math.max(page, 1) - 1) * take;
      const where = { actividadId: a.id };
      const [items, total] = await Promise.all([
        tx.entregaEvidenciaKairos.findMany({
          where,
          orderBy: [{ createdAt: "asc" }, { version: "asc" }],
          skip,
          take,
          select: {
            id: true,
            version: true,
            comment: true,
            createdAt: true,
            author: { select: { id: true, codigo: true } },
            archivo: {
              select: {
                id: true,
                originalName: true,
                detectedMime: true,
                sizeBytes: true,
                status: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        }),
        tx.entregaEvidenciaKairos.count({ where }),
      ]);
      return {
        items: items.map((x) => ({
          ...x,
          archivo: { ...x.archivo, sizeBytes: Number(x.archivo.sizeBytes) },
        })),
        total,
        page: Math.max(page, 1),
        pageSize: take,
      };
    });
  }
  async comments(
    actor: AuthUser,
    projectId: string,
    id: string,
    page = 1,
    pageSize = 50,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { a } = await this.lock(tx, projectId, id, actor, false);
      const take = Math.min(Math.max(pageSize, 1), 100);
      const skip = (Math.max(page, 1) - 1) * take;
      const where = { actividadId: a.id };
      const [items, total] = await Promise.all([
        tx.comentarioActividadKairos.findMany({
          where,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip,
          take,
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: { select: { id: true, codigo: true } },
          },
        }),
        tx.comentarioActividadKairos.count({ where }),
      ]);
      return { items, total, page: Math.max(page, 1), pageSize: take };
    });
  }
  async evidenceDownload(
    actor: AuthUser,
    projectId: string,
    activityId: string,
    evidenceId: string,
  ) {
    this.active(actor);
    const archivoId = await this.prisma.$transaction(async (tx) => {
      const { a } = await this.lock(tx, projectId, activityId, actor, false);
      const e = await tx.entregaEvidenciaKairos.findFirst({
        where: { id: evidenceId, actividadId: a.id },
        select: { archivoId: true },
      });
      if (!e) throw notFound("KAIROS_EVIDENCE_NOT_FOUND");
      return e.archivoId;
    });
    return this.storage.downloadUrl(
      archivoId,
      {
        subjectId: String(actor.id),
        resourceId: archivoId,
        purpose: "download",
        issuedAt: new Date(),
      } as any,
      String(actor.id),
    );
  }
}
