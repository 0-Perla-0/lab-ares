import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { notFound } from "../common/errors/domain-error";
import {
  EstadoActividadKairos,
  EstadoProyectoKairos,
  EstadoUsuario,
} from "../generated/prisma/enums";
import type { AuthUser } from "../auth/auth-user";
import type { KanbanQuery } from "./kanban.schemas";

const LANES = [
  EstadoActividadKairos.PENDIENTE,
  EstadoActividadKairos.EN_PROGRESO,
  EstadoActividadKairos.BLOQUEADA,
  EstadoActividadKairos.EN_REVISION,
  EstadoActividadKairos.REQUIERE_CORRECCION,
  EstadoActividadKairos.TERMINADA,
  EstadoActividadKairos.CANCELADA,
] as const;

const cardSelect = {
  id: true,
  title: true,
  state: true,
  priority: true,
  complexity: true,
  startAt: true,
  dueAt: true,
  closedAt: true,
  createdAt: true,
  responsable: { select: { id: true, codigo: true } },
  _count: { select: { participants: true } },
} as const;

function isOverdue(dueAt: Date | null, state: EstadoActividadKairos, now: Date) {
  return !!dueAt && dueAt < now && state !== EstadoActividadKairos.TERMINADA && state !== EstadoActividadKairos.CANCELADA;
}

@Injectable()
export class KairosKanbanService {
  constructor(private readonly prisma: PrismaService) {}

  async get(actor: AuthUser, projectId: string, query: KanbanQuery) {
    if (actor.estado !== EstadoUsuario.ACTIVA || !/^c[a-z0-9]{20,30}$/.test(projectId))
      throw notFound("KAIROS_PROJECT_NOT_FOUND");

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM ProyectoKairos WHERE id = ${projectId} FOR UPDATE`;
      await tx.$executeRaw`SELECT proyectoId FROM MiembroProyectoKairos WHERE proyectoId = ${projectId} AND usuarioId = ${actor.id} AND removedAt IS NULL FOR UPDATE`;
      const project = await tx.proyectoKairos.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      const membership = await tx.miembroProyectoKairos.findFirst({
        where: { proyectoId: projectId, usuarioId: actor.id, removedAt: null },
        select: { usuarioId: true },
      });
      if (!project || !membership) throw notFound("KAIROS_PROJECT_NOT_FOUND");

      const now = new Date();
      const base: any = {
        proyectoId: projectId,
        ...(query.responsableId === undefined ? {} : { responsableId: query.responsableId }),
        ...(query.participantId === undefined ? {} : { participants: { some: { usuarioId: query.participantId } } }),
        ...(query.priority === undefined ? {} : { priority: query.priority }),
        ...(query.complexity === undefined ? {} : { complexity: query.complexity }),
      };
      if (query.vencida === true) {
        base.dueAt = { lt: now };
        base.state = { notIn: [EstadoActividadKairos.TERMINADA, EstadoActividadKairos.CANCELADA] };
      } else if (query.vencida === false) {
        base.OR = [
          { dueAt: null },
          { dueAt: { gte: now } },
          { state: { in: [EstadoActividadKairos.TERMINADA, EstadoActividadKairos.CANCELADA] } },
        ];
      }

      const lanes = await Promise.all(LANES.map(async (state) => {
        const where = { ...base, state };
        const [total, items] = await Promise.all([
          tx.actividadKairos.count({ where }),
          tx.actividadKairos.findMany({
            where,
            select: cardSelect,
            orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
            take: query.limitPerLane,
          }),
        ]);
        return {
          state,
          total,
          items: items.map((item: any) => ({
            id: item.id,
            title: item.title,
            state: item.state,
            priority: item.priority,
            complexity: item.complexity,
            responsable: item.responsable,
            startAt: item.startAt,
            dueAt: item.dueAt,
            closedAt: item.closedAt,
            vencida: isOverdue(item.dueAt, item.state, now),
            participantCount: item._count.participants,
            createdAt: item.createdAt,
          })),
        };
      }));
      return { projectId, generatedAt: now, lanes };
    });
  }
}
