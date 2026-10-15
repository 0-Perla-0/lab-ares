import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../auth/auth-user";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import { AuditService } from "../auth/audit.service";
import { DomainTransaction } from "../common/domain/domain-transaction";
import { FeaturePoliciesService } from "../common/domain/feature-policies.service";
import { operationalNotification } from "../common/domain/operational-notification";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import type {
  ServicePeriodCreate,
  ServicePeriodTransition,
} from "./service-periods.schemas";

@Injectable()
export class ServicePeriodsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly features: FeaturePoliciesService,
  ) {}

  private async authorize(
    tx: Prisma.TransactionClient | PrismaService,
    actor: AuthUser,
    userId: number,
    write = false,
  ) {
    const permission = write
      ? Permission.DOCUMENTS_REVIEW
      : Permission.DOCUMENTS_READ;
    const scope = getAccessScope(actor, permission);
    const target = await tx.usuario.findUnique({ where: { id: userId } });
    if (
      !target ||
      actor.estado !== "ACTIVA" ||
      !scope ||
      (scope === AccessScope.SELF && userId !== actor.id) ||
      (scope === AccessScope.AREA &&
        (actor.areaId == null ||
          actor.sedeId == null ||
          target.areaId !== actor.areaId ||
          target.sedeId !== actor.sedeId)) ||
      (scope === AccessScope.SEDE &&
        (actor.sedeId == null || target.sedeId !== actor.sedeId)) ||
      (write && userId === actor.id)
    )
      throw new ApiException("SERVICE_PERIOD_NOT_FOUND", 404);
    return target;
  }

  async list(actor: AuthUser, userId: number, page: number, pageSize: number) {
    await this.authorize(this.db, actor, userId);
    const where = { usuarioId: userId };
    const [items, total] = await this.db.$transaction([
      this.db.periodoServicio.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: { eventos: { orderBy: { version: "asc" } } },
      }),
      this.db.periodoServicio.count({ where }),
    ]);
    return {
      items,
      total,
      page,
      pageSize,
      semantics: "OPERATIONAL_ONLY_NO_HOUR_CREDIT_OR_LEGAL_RELEASE",
    };
  }

  private async event(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    period: {
      id: string;
      usuarioId: number;
      estado: "REGISTRADO" | "INICIADO" | "CERRADO" | "CANCELADO";
      version: number;
    },
    motivo: string,
  ) {
    await tx.eventoPeriodoServicio.create({
      data: {
        periodoId: period.id,
        actorId: actor.id,
        estado: period.estado,
        version: period.version,
        motivo,
      },
    });
    await this.audit.append(
      {
        actorId: actor.id,
        subjectId: period.usuarioId,
        action: "SERVICE_PERIOD_CHANGED",
        module: "DOCUMENTS",
        resource: "service_period",
        objectId: period.id,
        metadata: { estado: period.estado, version: period.version },
      },
      tx,
    );
    await operationalNotification(
      tx,
      period.usuarioId,
      "SERVICE_PERIOD_CHANGED",
      { periodId: period.id, estado: period.estado, version: period.version },
    );
  }

  async create(actor: AuthUser, key: string, input: ServicePeriodCreate) {
    const visibleFormalization = async (tx: Prisma.TransactionClient) => {
      const formalization = await tx.formalizacionExpediente.findUnique({
        where: { id: input.formalizacionId },
      });
      if (!formalization)
        throw new ApiException("SERVICE_PERIOD_NOT_FOUND", 404);
      await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${formalization.usuarioId} FOR UPDATE`;
      const user = await this.authorize(
        tx,
        actor,
        formalization.usuarioId,
        true,
      );
      if (user.rol !== "PRESTADOR" || user.estado !== "ACTIVA")
        throw new ApiException("SERVICE_PERIOD_TARGET_INACTIVE", 409);
      return formalization;
    };
    return new DomainTransaction(this.db).run(
      actor,
      key,
      { action: "SERVICE_PERIOD_CREATE", input },
      async (tx) => {
        await this.features.requireInTransaction(tx, "DOCUMENTS.PERIOD", actor);
        const formalization = await visibleFormalization(tx);
        const fin = new Date(`${input.fin}T00:00:00.000Z`);
        if (fin < formalization.inicio)
          throw new ApiException("SERVICE_PERIOD_INVALID_DATES", 400);
        if (
          await tx.periodoServicio.findUnique({
            where: { formalizacionId: formalization.id },
          })
        )
          throw new ApiException("SERVICE_PERIOD_ALREADY_REGISTERED", 409);
        const period = await tx.periodoServicio.create({
          data: {
            usuarioId: formalization.usuarioId,
            formalizacionId: formalization.id,
            inicio: formalization.inicio,
            fin,
          },
        });
        await this.event(tx, actor, period, input.motivo);
        return period;
      },
      async (tx) => {
        await visibleFormalization(tx);
      },
    );
  }

  async transition(
    actor: AuthUser,
    key: string,
    id: string,
    input: ServicePeriodTransition,
  ) {
    const visible = async (tx: Prisma.TransactionClient) => {
      const period = await tx.periodoServicio.findUnique({ where: { id } });
      if (!period) throw new ApiException("SERVICE_PERIOD_NOT_FOUND", 404);
      await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${period.usuarioId} FOR UPDATE`;
      await this.authorize(tx, actor, period.usuarioId, true);
      return period;
    };
    return new DomainTransaction(this.db).run(
      actor,
      key,
      { action: "SERVICE_PERIOD_TRANSITION", id, input },
      async (tx) => {
        await visible(tx);
        await tx.$queryRaw`SELECT id FROM PeriodoServicio WHERE id = ${id} FOR UPDATE`;
        const period = await tx.periodoServicio.findUniqueOrThrow({
          where: { id },
          include: { formalizacion: { include: { adscripcion: true } } },
        });
        if (period.version !== input.expectedVersion)
          throw new ApiException("SERVICE_PERIOD_VERSION_CHANGED", 409);
        const valid =
          (input.estado === "INICIADO" && period.estado === "REGISTRADO") ||
          (input.estado === "CERRADO" && period.estado === "INICIADO") ||
          (input.estado === "CANCELADO" &&
            ["REGISTRADO", "INICIADO"].includes(period.estado));
        if (!valid) throw new ApiException("SERVICE_PERIOD_STATE_INVALID", 409);
        if (input.estado === "INICIADO") {
          await this.features.requireInTransaction(
            tx,
            "DOCUMENTS.PERIOD",
            actor,
          );
          const target = await this.authorize(
            tx,
            actor,
            period.usuarioId,
            true,
          );
          const academic = period.formalizacion.adscripcion;
          if (
            target.estado !== "ACTIVA" ||
            target.rol !== "PRESTADOR" ||
            academic.estado !== "CONFIRMADA" ||
            academic.inicio > period.inicio ||
            (academic.fin && academic.fin < period.inicio)
          )
            throw new ApiException("ACADEMIC_FORMALIZATION_REQUIRED", 409);
        }
        const next = await tx.periodoServicio.update({
          where: { id },
          data: { estado: input.estado, version: { increment: 1 } },
        });
        await this.event(tx, actor, next, input.motivo);
        return next;
      },
      async (tx) => {
        await visible(tx);
      },
    );
  }
}
