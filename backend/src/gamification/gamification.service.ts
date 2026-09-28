import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "../auth/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { getAccessScope, Permission } from "../auth/permissions";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import {
  EstadoUsuario,
  RolUsuario,
  TipoEventoGamificacion,
} from "../generated/prisma/enums";
import type {
  GamificationBadgeInput,
  GamificationPageInput,
  GamificationRuleInput,
  ManualRecognitionInput,
} from "./gamification.schemas";

const CUID = /^c[a-z0-9]{20,30}$/;

@Injectable()
export class GamificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  private enabledOrThrow() {
    if (!this.config.get("GAMIFICATION_ENABLED"))
      throw new ServiceUnavailableException("GAMIFICATION_DISABLED");
  }

  private enabled() {
    return this.config.get("GAMIFICATION_ENABLED");
  }

  private active(actor: AuthUser) {
    if (actor.estado !== EstadoUsuario.ACTIVA) throw new ForbiddenException();
  }

  private admin(actor: AuthUser) {
    this.active(actor);
    if (
      actor.rol !== RolUsuario.ADMIN ||
      !getAccessScope(actor, Permission.GAMIFICATION_MANAGE)
    )
      throw new ForbiddenException();
  }

  private eventId(id: string) {
    if (!CUID.test(id))
      throw new NotFoundException("GAMIFICATION_EVENT_NOT_FOUND");
  }

  private assertRead(actor: AuthUser, userId: number) {
    this.active(actor);
    if (actor.id === userId) {
      if (!getAccessScope(actor, Permission.GAMIFICATION_READ))
        throw new ForbiddenException();
      return;
    }
    this.admin(actor);
  }

  private async profileData(userId: number) {
    const user = await this.prisma.usuario.findFirst({
      where: { id: userId, estado: EstadoUsuario.ACTIVA },
      select: { id: true, codigo: true },
    });
    if (!user) throw new NotFoundException("GAMIFICATION_PROFILE_NOT_FOUND");
    const aggregate = await this.prisma.eventoGamificacion.aggregate({
      where: { usuarioId: userId },
      _sum: { puntos: true },
      _count: { id: true },
    });
    const puntos = aggregate._sum.puntos ?? 0;
    const insignias = await this.prisma.insigniaGamificacion.findMany({
      where: { activa: true, umbralPuntos: { lte: puntos } },
      orderBy: [{ umbralPuntos: "asc" }, { codigo: "asc" }],
      select: {
        codigo: true,
        nombre: true,
        descripcion: true,
        umbralPuntos: true,
        version: true,
      },
    });
    const pointsPerLevel = this.config.get("GAMIFICATION_POINTS_PER_LEVEL");
    return {
      usuario: user,
      puntos,
      nivel: Math.floor(Math.max(0, puntos) / pointsPerLevel) + 1,
      puntosPorNivel: pointsPerLevel,
      eventos: aggregate._count.id,
      insignias,
      privado: true,
    };
  }

  async profile(actor: AuthUser, userId = actor.id) {
    this.enabledOrThrow();
    this.assertRead(actor, userId);
    return this.profileData(userId);
  }

  async history(actor: AuthUser, userId: number, input: GamificationPageInput) {
    this.enabledOrThrow();
    this.assertRead(actor, userId);
    const where = { usuarioId: userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.eventoGamificacion.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          tipo: true,
          puntos: true,
          motivo: true,
          actividadId: true,
          regla: { select: { codigo: true, version: true } },
          reversaDeId: true,
          createdAt: true,
        },
      }),
      this.prisma.eventoGamificacion.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async listRules(actor: AuthUser) {
    this.enabledOrThrow();
    this.admin(actor);
    return this.prisma.reglaGamificacion.findMany({
      orderBy: [{ codigo: "asc" }, { version: "desc" }],
    });
  }

  async createRuleVersion(actor: AuthUser, input: GamificationRuleInput) {
    this.enabledOrThrow();
    this.admin(actor);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM ReglaGamificacion WHERE origen=${input.origen} FOR UPDATE`;
        const latest = await tx.reglaGamificacion.aggregate({
          where: { codigo: input.codigo },
          _max: { version: true },
        });
        await tx.reglaGamificacion.updateMany({
          where: { origen: input.origen, activa: true },
          data: { activa: false },
        });
        const rule = await tx.reglaGamificacion.create({
          data: {
            ...input,
            version: (latest._max.version ?? 0) + 1,
            creadoPorId: actor.id,
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: actor.id,
            action: "GAMIFICATION_RULE_VERSION_CREATED",
            resource: "gamification_rule",
            correlationId: rule.id,
            metadata: {
              code: rule.codigo,
              version: rule.version,
              origin: rule.origen,
              points: rule.puntos,
              reason: input.motivo,
            },
          },
          tx,
        );
        return rule;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002")
        throw new ConflictException("GAMIFICATION_RULE_VERSION_CONFLICT");
      throw error;
    }
  }

  async listBadges(actor: AuthUser) {
    this.enabledOrThrow();
    this.admin(actor);
    return this.prisma.insigniaGamificacion.findMany({
      orderBy: [{ codigo: "asc" }, { version: "desc" }],
    });
  }

  async createBadgeVersion(actor: AuthUser, input: GamificationBadgeInput) {
    this.enabledOrThrow();
    this.admin(actor);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM InsigniaGamificacion WHERE codigo=${input.codigo} FOR UPDATE`;
        const latest = await tx.insigniaGamificacion.aggregate({
          where: { codigo: input.codigo },
          _max: { version: true },
        });
        await tx.insigniaGamificacion.updateMany({
          where: { codigo: input.codigo, activa: true },
          data: { activa: false },
        });
        const badge = await tx.insigniaGamificacion.create({
          data: {
            ...input,
            version: (latest._max.version ?? 0) + 1,
            creadoPorId: actor.id,
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: actor.id,
            action: "GAMIFICATION_BADGE_VERSION_CREATED",
            resource: "gamification_badge",
            correlationId: badge.id,
            metadata: {
              code: badge.codigo,
              version: badge.version,
              threshold: badge.umbralPuntos,
              reason: input.motivo,
            },
          },
          tx,
        );
        return badge;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002")
        throw new ConflictException("GAMIFICATION_BADGE_VERSION_CONFLICT");
      throw error;
    }
  }

  async recognize(
    actor: AuthUser,
    input: ManualRecognitionInput,
    idempotencyKey: string,
  ) {
    this.enabledOrThrow();
    this.admin(actor);
    const sourceKey = `manual:${idempotencyKey}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM Usuario WHERE id=${input.usuarioId} FOR UPDATE`;
      const target = await tx.usuario.findFirst({
        where: { id: input.usuarioId, estado: EstadoUsuario.ACTIVA },
        select: { id: true },
      });
      if (!target)
        throw new NotFoundException("GAMIFICATION_PROFILE_NOT_FOUND");
      const existing = await tx.eventoGamificacion.findUnique({
        where: { sourceKey },
      });
      if (existing) {
        if (
          existing.usuarioId !== input.usuarioId ||
          existing.puntos !== input.puntos ||
          existing.motivo !== input.motivo
        )
          throw new ConflictException("IDEMPOTENCY_KEY_REUSED");
        return existing;
      }
      const event = await tx.eventoGamificacion.create({
        data: {
          usuarioId: input.usuarioId,
          actorId: actor.id,
          tipo: TipoEventoGamificacion.RECONOCIMIENTO_MANUAL,
          puntos: input.puntos,
          sourceKey,
          motivo: input.motivo,
        },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: input.usuarioId,
          action: "GAMIFICATION_MANUAL_RECOGNITION_GRANTED",
          resource: "gamification_event",
          correlationId: event.id,
          metadata: { points: input.puntos, reason: input.motivo },
        },
        tx,
      );
      return event;
    });
  }

  async reverseManual(
    actor: AuthUser,
    eventId: string,
    motivo: string,
    idempotencyKey: string,
  ) {
    this.enabledOrThrow();
    this.admin(actor);
    this.eventId(eventId);
    const sourceKey = `manual-reversal:${idempotencyKey}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM EventoGamificacion WHERE id=${eventId} FOR UPDATE`;
      const original = await tx.eventoGamificacion.findUnique({
        where: { id: eventId },
        include: { reverso: true },
      });
      if (
        !original ||
        original.tipo !== TipoEventoGamificacion.RECONOCIMIENTO_MANUAL
      )
        throw new NotFoundException("GAMIFICATION_EVENT_NOT_FOUND");
      if (original.reverso) {
        if (original.reverso.sourceKey === sourceKey) return original.reverso;
        throw new ConflictException("GAMIFICATION_EVENT_ALREADY_REVERSED");
      }
      const duplicate = await tx.eventoGamificacion.findUnique({
        where: { sourceKey },
      });
      if (duplicate) throw new ConflictException("IDEMPOTENCY_KEY_REUSED");
      const reversal = await tx.eventoGamificacion.create({
        data: {
          usuarioId: original.usuarioId,
          actorId: actor.id,
          tipo: TipoEventoGamificacion.REVERSO,
          puntos: -original.puntos,
          sourceKey,
          motivo,
          reversaDeId: original.id,
        },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: original.usuarioId,
          action: "GAMIFICATION_MANUAL_RECOGNITION_REVERSED",
          resource: "gamification_event",
          correlationId: reversal.id,
          metadata: { originalEventId: original.id, reason: motivo },
        },
        tx,
      );
      return reversal;
    });
  }

  async awardKairos(
    tx: any,
    input: {
      activityId: string;
      userId: number;
      actorId: number;
      historyId: string;
    },
  ) {
    if (!this.enabled()) return null;
    const sourceKey = `kairos-completed:${input.historyId}`;
    const duplicate = await tx.eventoGamificacion.findUnique({
      where: { sourceKey },
    });
    if (duplicate) return duplicate;
    await tx.$executeRaw`SELECT id FROM Usuario WHERE id=${input.userId} FOR UPDATE`;
    const rule = await tx.reglaGamificacion.findFirst({
      where: { origen: "KAIROS_TERMINADA", activa: true },
      orderBy: { version: "desc" },
    });
    if (!rule) return null;
    const event = await tx.eventoGamificacion.create({
      data: {
        usuarioId: input.userId,
        actorId: input.actorId,
        tipo: TipoEventoGamificacion.OTORGAMIENTO,
        puntos: rule.puntos,
        sourceKey,
        motivo: "Actividad Kairos terminada y aprobada",
        actividadId: input.activityId,
        reglaId: rule.id,
      },
    });
    await this.audit.append(
      {
        actorId: input.actorId,
        subjectId: input.userId,
        action: "GAMIFICATION_KAIROS_POINTS_GRANTED",
        resource: "gamification_event",
        correlationId: event.id,
        metadata: {
          activityId: input.activityId,
          points: rule.puntos,
          ruleId: rule.id,
          ruleVersion: rule.version,
        },
      },
      tx,
    );
    return event;
  }

  async reverseKairos(
    tx: any,
    input: {
      activityId: string;
      actorId: number;
      historyId: string;
      reason: string;
    },
  ) {
    if (!this.enabled()) return null;
    const sourceKey = `kairos-reopened:${input.historyId}`;
    const duplicate = await tx.eventoGamificacion.findUnique({
      where: { sourceKey },
    });
    if (duplicate) return duplicate;
    const original = await tx.eventoGamificacion.findFirst({
      where: {
        actividadId: input.activityId,
        tipo: TipoEventoGamificacion.OTORGAMIENTO,
        reverso: null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!original) return null;
    const event = await tx.eventoGamificacion.create({
      data: {
        usuarioId: original.usuarioId,
        actorId: input.actorId,
        tipo: TipoEventoGamificacion.REVERSO,
        puntos: -original.puntos,
        sourceKey,
        motivo: input.reason,
        actividadId: input.activityId,
        reglaId: original.reglaId,
        reversaDeId: original.id,
      },
    });
    await this.audit.append(
      {
        actorId: input.actorId,
        subjectId: original.usuarioId,
        action: "GAMIFICATION_KAIROS_POINTS_REVERSED",
        resource: "gamification_event",
        correlationId: event.id,
        metadata: {
          activityId: input.activityId,
          originalEventId: original.id,
          reason: input.reason,
        },
      },
      tx,
    );
    return event;
  }
}
