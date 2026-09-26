import { createHash } from "node:crypto";
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "../auth/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import {
  conflict,
  invalidInput,
  notFound,
} from "../common/errors/domain-error";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import {
  EstadoArchivo,
  EstadoTrabajoImpresion3D,
  EstadoUsuario,
  ResultadoEjecucionImpresion3D,
  TipoOperacionImpresion3D,
} from "../generated/prisma/enums";
import { NotificationsService } from "../notifications/notifications.service";
import { StorageService } from "../storage/storage.service";
import { issueDownloadCapability } from "../storage/storage.types";
import type {
  Printing3dAssignInput,
  Printing3dExecutionFinishInput,
  Printing3dExecutionStartInput,
  Printing3dJobCreateInput,
  Printing3dJobListInput,
  Printing3dReviewInput,
} from "./printing-3d.schemas";

const CUID = /^c[a-z0-9]{20,30}$/;

const safeJobInclude = {
  solicitante: { select: { id: true, codigo: true } },
  operadorAsignado: { select: { id: true, codigo: true } },
  revisadoPor: { select: { id: true, codigo: true } },
  archivo: {
    select: {
      id: true,
      originalName: true,
      detectedMime: true,
      status: true,
    },
  },
  ejecuciones: {
    orderBy: [{ numero: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      numero: true,
      startedAt: true,
      finishedAt: true,
      material: true,
      pesoGramos: true,
      resultado: true,
      observacion: true,
      operador: { select: { id: true, codigo: true } },
    },
  },
};

type MutationResult = {
  trabajoId: string;
  ejecucionId?: string;
  data: unknown;
};

@Injectable()
export class Printing3dService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Environment, true>,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  private enabledOrThrow() {
    if (!this.config.get("PRINTING_3D_ENABLED"))
      throw new ServiceUnavailableException("PRINTING_3D_DISABLED");
  }

  private active(actor: AuthUser) {
    if (!actor || actor.estado !== EstadoUsuario.ACTIVA)
      throw new ForbiddenException();
  }

  private id(id: string) {
    if (!CUID.test(id)) throw notFound("PRINTING_3D_JOB_NOT_FOUND");
  }

  private scopeMatches(
    actor: Pick<AuthUser, "sedeId" | "areaId">,
    scope: AccessScope,
    job: { sedeId: number | null; areaId: number | null },
  ) {
    return (
      scope === AccessScope.GLOBAL ||
      (scope === AccessScope.SEDE &&
        actor.sedeId != null &&
        actor.sedeId === job.sedeId) ||
      (scope === AccessScope.AREA &&
        actor.areaId != null &&
        actor.areaId === job.areaId)
    );
  }

  private manage(
    actor: AuthUser,
    job: { sedeId: number | null; areaId: number | null },
  ) {
    this.active(actor);
    const scope = getAccessScope(actor, Permission.PRINTING_3D_MANAGE);
    if (!scope || !this.scopeMatches(actor, scope, job))
      throw new ForbiddenException();
    return scope;
  }

  private operate(actor: AuthUser) {
    this.active(actor);
    const scope = getAccessScope(actor, Permission.PRINTING_3D_OPERATE);
    if (!scope) throw new ForbiddenException();
    return scope;
  }

  private visible(actor: AuthUser, job: any) {
    if (job.solicitanteId === actor.id || job.operadorAsignadoId === actor.id)
      return true;
    const scope =
      getAccessScope(actor, Permission.PRINTING_3D_MANAGE) ??
      getAccessScope(actor, Permission.PRINTING_3D_OPERATE);
    return Boolean(scope && this.scopeMatches(actor, scope, job));
  }

  private visibleWhere(actor: AuthUser) {
    this.active(actor);
    const own = [{ solicitanteId: actor.id }, { operadorAsignadoId: actor.id }];
    const scope =
      getAccessScope(actor, Permission.PRINTING_3D_MANAGE) ??
      getAccessScope(actor, Permission.PRINTING_3D_OPERATE);
    if (scope === AccessScope.GLOBAL) return {};
    if (scope === AccessScope.SEDE && actor.sedeId != null)
      return { OR: [...own, { sedeId: actor.sedeId }] };
    if (scope === AccessScope.AREA && actor.areaId != null)
      return { OR: [...own, { areaId: actor.areaId }] };
    return { OR: own };
  }

  private canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.canonical(item));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.canonical(item)]),
      );
    return value;
  }

  private fingerprint(type: TipoOperacionImpresion3D, payload: unknown) {
    return createHash("sha256")
      .update(JSON.stringify(this.canonical({ type, payload })))
      .digest("hex");
  }

  private async replay(client: any, operation: any, actor: AuthUser) {
    if (!operation.trabajoId)
      throw conflict("PRINTING_3D_OPERATION_INCOMPLETE");
    const trabajo = await client.trabajoImpresion3D.findUnique({
      where: { id: operation.trabajoId },
      include: safeJobInclude,
    });
    if (!trabajo || !this.visible(actor, trabajo))
      throw notFound("PRINTING_3D_JOB_NOT_FOUND");
    if (!operation.ejecucionId) return trabajo;
    const ejecucion = await client.ejecucionImpresion3D.findUnique({
      where: { id: operation.ejecucionId },
      select: safeJobInclude.ejecuciones.select,
    });
    if (!ejecucion) throw notFound("PRINTING_3D_EXECUTION_NOT_FOUND");
    return { trabajo, ejecucion };
  }

  private async mutation(
    actor: AuthUser,
    key: string,
    type: TipoOperacionImpresion3D,
    payload: unknown,
    run: (tx: any) => Promise<MutationResult>,
  ) {
    this.active(actor);
    const requestHash = this.fingerprint(type, payload);
    const execute = () =>
      this.prisma.$transaction(async (tx) => {
        const existing = await tx.operacionImpresion3D.findUnique({
          where: { actorId_key: { actorId: actor.id, key } },
        });
        if (existing) {
          if (existing.tipo !== type || existing.requestHash !== requestHash)
            throw conflict("IDEMPOTENCY_KEY_REUSED");
          return this.replay(tx, existing, actor);
        }
        const operation = await tx.operacionImpresion3D.create({
          data: { actorId: actor.id, key, requestHash, tipo: type },
        });
        const result = await run(tx);
        await tx.operacionImpresion3D.update({
          where: { id: operation.id },
          data: {
            trabajoId: result.trabajoId,
            ejecucionId: result.ejecucionId,
          },
        });
        return result.data;
      });
    try {
      return await execute();
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const existing = await this.prisma.operacionImpresion3D.findUnique({
        where: { actorId_key: { actorId: actor.id, key } },
      });
      if (!existing) throw error;
      if (existing.tipo !== type || existing.requestHash !== requestHash)
        throw conflict("IDEMPOTENCY_KEY_REUSED");
      return this.replay(this.prisma, existing, actor);
    }
  }

  async create(
    actor: AuthUser,
    input: Printing3dJobCreateInput,
    idempotencyKey: string,
  ) {
    this.enabledOrThrow();
    this.active(actor);
    if (!getAccessScope(actor, Permission.PRINTING_3D_REQUEST))
      throw new ForbiddenException();
    return this.mutation(
      actor,
      idempotencyKey,
      TipoOperacionImpresion3D.CREAR_TRABAJO,
      input,
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM Archivo WHERE id=${input.archivoId} FOR UPDATE`;
        const file = await tx.archivo.findUnique({
          where: { id: input.archivoId },
          select: {
            id: true,
            propietarioId: true,
            status: true,
            detectedMime: true,
          },
        });
        if (
          !file ||
          file.propietarioId !== actor.id ||
          file.status !== EstadoArchivo.DISPONIBLE ||
          file.detectedMime !== "model/stl"
        )
          throw invalidInput("PRINTING_3D_STL_NOT_AVAILABLE");
        const trabajo = await tx.trabajoImpresion3D.create({
          data: {
            solicitanteId: actor.id,
            archivoId: file.id,
            descripcion: input.descripcion,
            sedeId: actor.sedeId,
            areaId: actor.areaId,
          },
          include: safeJobInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: actor.id,
            action: "PRINTING_3D_JOB_CREATED",
            resource: "printing_3d_job",
            correlationId: trabajo.id,
            metadata: { result: trabajo.estado, fileId: file.id },
          },
          tx,
        );
        return { trabajoId: trabajo.id, data: trabajo };
      },
    );
  }

  async list(actor: AuthUser, input: Printing3dJobListInput) {
    this.enabledOrThrow();
    const visible = this.visibleWhere(actor);
    const where = input.estado
      ? { AND: [visible, { estado: input.estado }] }
      : visible;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.trabajoImpresion3D.findMany({
        where,
        include: safeJobInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.trabajoImpresion3D.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async detail(actor: AuthUser, id: string) {
    this.enabledOrThrow();
    this.active(actor);
    this.id(id);
    const job = await this.prisma.trabajoImpresion3D.findUnique({
      where: { id },
      include: safeJobInclude,
    });
    if (!job || !this.visible(actor, job))
      throw notFound("PRINTING_3D_JOB_NOT_FOUND");
    return job;
  }

  async review(
    actor: AuthUser,
    id: string,
    input: Printing3dReviewInput,
    idempotencyKey: string,
  ) {
    this.enabledOrThrow();
    this.id(id);
    const type =
      input.decision === "START"
        ? TipoOperacionImpresion3D.INICIAR_REVISION
        : TipoOperacionImpresion3D.RESOLVER_REVISION;
    return this.mutation(
      actor,
      idempotencyKey,
      type,
      { id, ...input },
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM TrabajoImpresion3D WHERE id=${id} FOR UPDATE`;
        const current = await tx.trabajoImpresion3D.findUnique({
          where: { id },
        });
        if (!current) throw notFound("PRINTING_3D_JOB_NOT_FOUND");
        this.manage(actor, current);
        if (
          (input.decision === "START" &&
            current.estado !== EstadoTrabajoImpresion3D.SOLICITADO) ||
          (input.decision !== "START" &&
            current.estado !== EstadoTrabajoImpresion3D.EN_REVISION)
        )
          throw conflict("PRINTING_3D_TRANSITION_INVALID");
        const now = new Date();
        const estado =
          input.decision === "START"
            ? EstadoTrabajoImpresion3D.EN_REVISION
            : input.decision === "APPROVE"
              ? EstadoTrabajoImpresion3D.APROBADO
              : EstadoTrabajoImpresion3D.RECHAZADO;
        const trabajo = await tx.trabajoImpresion3D.update({
          where: { id },
          data: {
            estado,
            revisadoPorId: actor.id,
            motivoRevision: input.motivo ?? null,
            reviewedAt: input.decision === "START" ? null : now,
          },
          include: safeJobInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: current.solicitanteId,
            action:
              input.decision === "START"
                ? "PRINTING_3D_REVIEW_STARTED"
                : "PRINTING_3D_REVIEW_RESOLVED",
            resource: "printing_3d_job",
            correlationId: id,
            metadata: { result: estado, reason: input.motivo ?? null },
          },
          tx,
        );
        if (input.decision !== "START")
          await this.notifications.create(
            current.solicitanteId,
            "PRINTING_3D_REVIEW_RESOLVED",
            { jobId: id, estado },
            tx,
          );
        return { trabajoId: id, data: trabajo };
      },
    );
  }

  async assign(
    actor: AuthUser,
    id: string,
    input: Printing3dAssignInput,
    idempotencyKey: string,
  ) {
    this.enabledOrThrow();
    this.id(id);
    return this.mutation(
      actor,
      idempotencyKey,
      TipoOperacionImpresion3D.ASIGNAR_OPERADOR,
      { id, ...input },
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM TrabajoImpresion3D WHERE id=${id} FOR UPDATE`;
        const current = await tx.trabajoImpresion3D.findUnique({
          where: { id },
        });
        if (!current) throw notFound("PRINTING_3D_JOB_NOT_FOUND");
        this.manage(actor, current);
        if (current.estado !== EstadoTrabajoImpresion3D.APROBADO)
          throw conflict("PRINTING_3D_TRANSITION_INVALID");
        const operator = await tx.usuario.findFirst({
          where: { id: input.operadorId, estado: EstadoUsuario.ACTIVA },
          select: {
            id: true,
            codigo: true,
            email: true,
            rol: true,
            estado: true,
            sedeId: true,
            areaId: true,
            turnoId: true,
          },
        });
        const operatorScope = operator
          ? getAccessScope(operator, Permission.PRINTING_3D_OPERATE)
          : null;
        if (
          !operator ||
          !operatorScope ||
          !this.scopeMatches(operator, operatorScope, current)
        )
          throw invalidInput("PRINTING_3D_OPERATOR_INVALID");
        const trabajo = await tx.trabajoImpresion3D.update({
          where: { id },
          data: {
            estado: EstadoTrabajoImpresion3D.EN_COLA,
            operadorAsignadoId: operator.id,
            assignedAt: new Date(),
          },
          include: safeJobInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: current.solicitanteId,
            action: "PRINTING_3D_OPERATOR_ASSIGNED",
            resource: "printing_3d_job",
            correlationId: id,
            metadata: { result: trabajo.estado, operatorId: operator.id },
          },
          tx,
        );
        await this.notifications.create(
          operator.id,
          "PRINTING_3D_OPERATOR_ASSIGNED",
          { jobId: id },
          tx,
        );
        return { trabajoId: id, data: trabajo };
      },
    );
  }

  async startExecution(
    actor: AuthUser,
    id: string,
    input: Printing3dExecutionStartInput,
    idempotencyKey: string,
  ) {
    this.enabledOrThrow();
    this.id(id);
    return this.mutation(
      actor,
      idempotencyKey,
      TipoOperacionImpresion3D.INICIAR_EJECUCION,
      { id, ...input },
      async (tx) => {
        this.operate(actor);
        await tx.$executeRaw`SELECT id FROM TrabajoImpresion3D WHERE id=${id} FOR UPDATE`;
        const current = await tx.trabajoImpresion3D.findUnique({
          where: { id },
        });
        if (
          !current ||
          current.operadorAsignadoId !== actor.id ||
          current.estado !== EstadoTrabajoImpresion3D.EN_COLA
        )
          throw notFound("PRINTING_3D_JOB_NOT_FOUND");
        const latest = await tx.ejecucionImpresion3D.aggregate({
          where: { trabajoId: id },
          _max: { numero: true },
        });
        const ejecucion = await tx.ejecucionImpresion3D.create({
          data: {
            trabajoId: id,
            operadorId: actor.id,
            numero: (latest._max.numero ?? 0) + 1,
            material: input.material,
          },
          select: safeJobInclude.ejecuciones.select,
        });
        const trabajo = await tx.trabajoImpresion3D.update({
          where: { id },
          data: { estado: EstadoTrabajoImpresion3D.EN_IMPRESION },
          include: safeJobInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: current.solicitanteId,
            action: "PRINTING_3D_EXECUTION_STARTED",
            resource: "printing_3d_execution",
            correlationId: ejecucion.id,
            metadata: { jobId: id, attempt: ejecucion.numero },
          },
          tx,
        );
        return {
          trabajoId: id,
          ejecucionId: ejecucion.id,
          data: { trabajo, ejecucion },
        };
      },
    );
  }

  async finishExecution(
    actor: AuthUser,
    id: string,
    executionId: string,
    input: Printing3dExecutionFinishInput,
    idempotencyKey: string,
  ) {
    this.enabledOrThrow();
    this.id(id);
    this.id(executionId);
    return this.mutation(
      actor,
      idempotencyKey,
      TipoOperacionImpresion3D.FINALIZAR_EJECUCION,
      { id, executionId, ...input },
      async (tx) => {
        this.operate(actor);
        await tx.$executeRaw`SELECT id FROM TrabajoImpresion3D WHERE id=${id} FOR UPDATE`;
        await tx.$executeRaw`SELECT id FROM EjecucionImpresion3D WHERE id=${executionId} FOR UPDATE`;
        const current = await tx.trabajoImpresion3D.findUnique({
          where: { id },
        });
        const execution = await tx.ejecucionImpresion3D.findFirst({
          where: { id: executionId, trabajoId: id },
        });
        if (
          !current ||
          !execution ||
          current.operadorAsignadoId !== actor.id ||
          execution.operadorId !== actor.id ||
          current.estado !== EstadoTrabajoImpresion3D.EN_IMPRESION ||
          execution.finishedAt
        )
          throw notFound("PRINTING_3D_EXECUTION_NOT_FOUND");
        const result =
          input.resultado === "COMPLETADA"
            ? ResultadoEjecucionImpresion3D.COMPLETADA
            : ResultadoEjecucionImpresion3D.FALLIDA;
        const estado =
          result === ResultadoEjecucionImpresion3D.COMPLETADA
            ? EstadoTrabajoImpresion3D.COMPLETADO
            : EstadoTrabajoImpresion3D.FALLIDO;
        const ejecucion = await tx.ejecucionImpresion3D.update({
          where: { id: executionId },
          data: {
            finishedAt: new Date(),
            resultado: result,
            pesoGramos: input.pesoGramos,
            observacion: input.observacion,
          },
          select: safeJobInclude.ejecuciones.select,
        });
        const trabajo = await tx.trabajoImpresion3D.update({
          where: { id },
          data: { estado },
          include: safeJobInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: current.solicitanteId,
            action: "PRINTING_3D_EXECUTION_FINISHED",
            resource: "printing_3d_execution",
            correlationId: executionId,
            metadata: { jobId: id, result },
          },
          tx,
        );
        await this.notifications.create(
          current.solicitanteId,
          "PRINTING_3D_EXECUTION_FINISHED",
          { jobId: id, estado },
          tx,
        );
        return {
          trabajoId: id,
          ejecucionId: executionId,
          data: { trabajo, ejecucion },
        };
      },
    );
  }

  async retry(
    actor: AuthUser,
    id: string,
    motivo: string,
    idempotencyKey: string,
  ) {
    this.enabledOrThrow();
    this.id(id);
    return this.mutation(
      actor,
      idempotencyKey,
      TipoOperacionImpresion3D.REENCOLAR,
      { id, motivo },
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM TrabajoImpresion3D WHERE id=${id} FOR UPDATE`;
        const current = await tx.trabajoImpresion3D.findUnique({
          where: { id },
        });
        if (!current || current.estado !== EstadoTrabajoImpresion3D.FALLIDO)
          throw notFound("PRINTING_3D_JOB_NOT_FOUND");
        const manager = getAccessScope(actor, Permission.PRINTING_3D_MANAGE);
        const assignedOperator =
          current.operadorAsignadoId === actor.id &&
          Boolean(getAccessScope(actor, Permission.PRINTING_3D_OPERATE));
        if (
          !assignedOperator &&
          (!manager || !this.scopeMatches(actor, manager, current))
        )
          throw new ForbiddenException();
        const trabajo = await tx.trabajoImpresion3D.update({
          where: { id },
          data: { estado: EstadoTrabajoImpresion3D.EN_COLA },
          include: safeJobInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: current.solicitanteId,
            action: "PRINTING_3D_JOB_REQUEUED",
            resource: "printing_3d_job",
            correlationId: id,
            metadata: { result: trabajo.estado, reason: motivo },
          },
          tx,
        );
        if (current.operadorAsignadoId)
          await this.notifications.create(
            current.operadorAsignadoId,
            "PRINTING_3D_JOB_REQUEUED",
            { jobId: id },
            tx,
          );
        return { trabajoId: id, data: trabajo };
      },
    );
  }

  async cancel(
    actor: AuthUser,
    id: string,
    motivo: string,
    idempotencyKey: string,
  ) {
    this.enabledOrThrow();
    this.active(actor);
    this.id(id);
    return this.mutation(
      actor,
      idempotencyKey,
      TipoOperacionImpresion3D.CANCELAR,
      { id, motivo },
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM TrabajoImpresion3D WHERE id=${id} FOR UPDATE`;
        const current = await tx.trabajoImpresion3D.findUnique({
          where: { id },
        });
        if (!current) throw notFound("PRINTING_3D_JOB_NOT_FOUND");
        const requesterCanCancel =
          current.solicitanteId === actor.id &&
          [
            EstadoTrabajoImpresion3D.SOLICITADO,
            EstadoTrabajoImpresion3D.EN_REVISION,
            EstadoTrabajoImpresion3D.APROBADO,
            EstadoTrabajoImpresion3D.EN_COLA,
          ].includes(current.estado);
        const manager = getAccessScope(actor, Permission.PRINTING_3D_MANAGE);
        const managerCanCancel = Boolean(
          manager && this.scopeMatches(actor, manager, current),
        );
        const assignedCanCancel =
          current.operadorAsignadoId === actor.id &&
          current.estado === EstadoTrabajoImpresion3D.EN_IMPRESION &&
          Boolean(getAccessScope(actor, Permission.PRINTING_3D_OPERATE));
        if (!requesterCanCancel && !managerCanCancel && !assignedCanCancel)
          throw new ForbiddenException();
        if (
          [
            EstadoTrabajoImpresion3D.COMPLETADO,
            EstadoTrabajoImpresion3D.RECHAZADO,
            EstadoTrabajoImpresion3D.CANCELADO,
          ].includes(current.estado)
        )
          throw conflict("PRINTING_3D_TRANSITION_INVALID");
        if (current.estado === EstadoTrabajoImpresion3D.EN_IMPRESION) {
          const activeExecution = await tx.ejecucionImpresion3D.findFirst({
            where: { trabajoId: id, finishedAt: null },
            orderBy: { numero: "desc" },
          });
          if (!activeExecution)
            throw conflict("PRINTING_3D_EXECUTION_STATE_INVALID");
          await tx.ejecucionImpresion3D.update({
            where: { id: activeExecution.id },
            data: {
              finishedAt: new Date(),
              resultado: ResultadoEjecucionImpresion3D.CANCELADA,
              observacion: motivo,
            },
          });
        }
        const trabajo = await tx.trabajoImpresion3D.update({
          where: { id },
          data: {
            estado: EstadoTrabajoImpresion3D.CANCELADO,
            canceladoPorId: actor.id,
            motivoCancelacion: motivo,
            cancelledAt: new Date(),
          },
          include: safeJobInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: current.solicitanteId,
            action: "PRINTING_3D_JOB_CANCELLED",
            resource: "printing_3d_job",
            correlationId: id,
            metadata: { result: trabajo.estado, reason: motivo },
          },
          tx,
        );
        return { trabajoId: id, data: trabajo };
      },
    );
  }

  async download(actor: AuthUser, id: string) {
    this.enabledOrThrow();
    this.active(actor);
    this.id(id);
    const fileId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM TrabajoImpresion3D WHERE id=${id} FOR UPDATE`;
      const job = await tx.trabajoImpresion3D.findUnique({
        where: { id },
        select: {
          id: true,
          solicitanteId: true,
          operadorAsignadoId: true,
          sedeId: true,
          areaId: true,
          archivoId: true,
          archivo: { select: { status: true, detectedMime: true } },
        },
      });
      if (
        !job ||
        !this.visible(actor, job) ||
        job.archivo.status !== EstadoArchivo.DISPONIBLE ||
        job.archivo.detectedMime !== "model/stl"
      )
        throw notFound("PRINTING_3D_JOB_NOT_FOUND");
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: job.solicitanteId,
          action: "PRINTING_3D_STL_DOWNLOAD_REQUESTED",
          resource: "printing_3d_job",
          correlationId: id,
          metadata: { result: "authorized" },
        },
        tx,
      );
      return job.archivoId;
    });
    return this.storage.downloadUrl(
      fileId,
      issueDownloadCapability({
        subjectId: String(actor.id),
        resourceId: fileId,
        purpose: "download",
        issuedAt: new Date(),
      }),
      String(actor.id),
    );
  }
}
