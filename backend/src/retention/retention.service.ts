import { createHash, randomUUID } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthUser } from "../auth/auth-user";
import { AuditService } from "../auth/audit.service";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import { ApiException } from "../common/errors/api.exception";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import {
  AccionFinalRetencion,
  CategoriaRetencion,
  EstadoArchivo,
  EstadoElementoSupresion,
  EstadoLoteSupresion,
  EstadoRegistroRetencion,
  EstadoReglaRetencion,
  EstadoReporteExportacion,
  EstadoRetencionLegal,
  EstadoSolicitudSupresion,
  EstadoUsuario,
  TipoOperacionRetencion,
} from "../generated/prisma/enums";
import { NotificationsService } from "../notifications/notifications.service";
import { journalHash } from "../recovery/journal-integrity";
import { S3Storage } from "../storage/s3.storage";
import { StorageService } from "../storage/storage.service";
import type {
  LegalHoldCreateInput,
  LegalHoldListInput,
  RetentionRecordCreateInput,
  RetentionRecordListInput,
  RetentionRuleCreateInput,
  RetentionRuleListInput,
  SuppressionBatchCreateInput,
  SuppressionBatchListInput,
  SuppressionRegistryListInput,
  SuppressionRequestListInput,
  SuppressionRequestResolveInput,
} from "./retention.schemas";

const DAY_MS = 86_400_000;
const CUID = /^c[a-z0-9]{20,30}$/;
const ACTIVE_SUPPRESSION_BATCH_STATES = [
  EstadoLoteSupresion.BORRADOR,
  EstadoLoteSupresion.AUTORIZADO,
  EstadoLoteSupresion.EN_EJECUCION,
  EstadoLoteSupresion.PAUSADO,
] as const;

const provisionalPolicies = new Map<
  CategoriaRetencion,
  { action: AccionFinalRetencion; resources: readonly string[] }
>([
  [
    CategoriaRetencion.EXPORTACIONES,
    {
      action: AccionFinalRetencion.ELIMINAR,
      resources: ["ReporteExportacion"],
    },
  ],
  [
    CategoriaRetencion.SESIONES_TOKENS,
    {
      action: AccionFinalRetencion.ELIMINAR,
      resources: ["Session", "RecoveryToken", "MfaChallenge"],
    },
  ],
  [
    CategoriaRetencion.NOTIFICACIONES_CORREO,
    { action: AccionFinalRetencion.ELIMINAR, resources: ["Notification"] },
  ],
  [
    CategoriaRetencion.ARCHIVOS_RECHAZADOS,
    { action: AccionFinalRetencion.ANONIMIZAR, resources: ["Archivo"] },
  ],
  [
    CategoriaRetencion.LOGS,
    { action: AccionFinalRetencion.ELIMINAR, resources: ["TechnicalLog"] },
  ],
]);

const ruleInclude = {
  creadoPor: { select: { id: true, codigo: true } },
  aprobadoPor: { select: { id: true, codigo: true } },
};

const recordInclude = {
  regla: {
    select: {
      id: true,
      version: true,
      accionFinal: true,
      provisional: true,
      automatica: true,
      estado: true,
    },
  },
  retencionesLegales: {
    where: { estado: EstadoRetencionLegal.ACTIVA },
    select: { id: true, responsable: true, reviewAt: true, endsAt: true },
  },
};

const batchInclude = {
  creadoPor: { select: { id: true, codigo: true } },
  autorizadoPor: { select: { id: true, codigo: true } },
  elementos: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      estado: true,
      errorCode: true,
      processedAt: true,
      registro: {
        select: {
          id: true,
          categoria: true,
          resourceType: true,
          resourceId: true,
          subjectId: true,
          estado: true,
          actionDueAt: true,
          regla: {
            select: {
              id: true,
              version: true,
              accionFinal: true,
              provisional: true,
              estado: true,
            },
          },
        },
      },
    },
  },
};

function api(code: string, status = HttpStatus.CONFLICT) {
  return new ApiException(code, status);
}

@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Environment, true>,
    private readonly storage: StorageService,
    private readonly objectStorage: S3Storage,
  ) {}

  private active(actor: AuthUser) {
    if (!actor || actor.estado !== EstadoUsuario.ACTIVA)
      throw api("UNAUTHORIZED", HttpStatus.UNAUTHORIZED);
  }

  private require(actor: AuthUser, permission: Permission) {
    this.active(actor);
    const scope = getAccessScope(actor, permission);
    if (scope !== AccessScope.GLOBAL)
      throw api("FORBIDDEN", HttpStatus.FORBIDDEN);
  }

  private request(actor: AuthUser) {
    this.active(actor);
    if (!getAccessScope(actor, Permission.RETENTION_REQUEST))
      throw api("FORBIDDEN", HttpStatus.FORBIDDEN);
  }

  private id(value: string) {
    if (!CUID.test(value))
      throw api("RETENTION_NOT_FOUND", HttpStatus.NOT_FOUND);
  }

  private stable(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((entry) => this.stable(entry));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, this.stable(entry)]),
      );
    return value;
  }

  private fingerprint(type: TipoOperacionRetencion, payload: unknown) {
    return createHash("sha256")
      .update(JSON.stringify(this.stable({ type, payload })))
      .digest("hex");
  }

  private async enqueueSuppressionJournal(tx: any, registry: any) {
    const existing = await tx.suppressionJournalEntry.findUnique({
      where: { registroSupresionId: registry.id },
    });
    if (existing) return existing;
    await tx.$executeRaw`SELECT id FROM SuppressionJournalHead WHERE id=${"global"} FOR UPDATE`;
    const head = await tx.suppressionJournalHead.findUnique({
      where: { id: "global" },
    });
    if (!head) throw api("SUPPRESSION_JOURNAL_UNAVAILABLE", 503);
    const sequence = head.lastSequence + 1;
    const occurredAt = registry.occurredAt.toISOString();
    const payload = {
      category: registry.categoria,
      resourceType: registry.resourceType,
      resourceFingerprint: registry.resourceFingerprint,
      action: registry.accion,
      policyVersion: registry.policyVersion,
      occurredAt,
    };
    const payloadHash = journalHash(payload);
    const created = await tx.suppressionJournalEntry.create({
      data: {
        sequence,
        registroSupresionId: registry.id,
        payload: this.json(payload),
        payloadHash,
        previousHash: head.lastHash,
        entryHash: "0".repeat(64),
      },
    });
    const entryHash = journalHash({
      entryId: created.id,
      sequence,
      previousHash: head.lastHash,
      payloadHash,
      occurredAt,
    });
    const entry = await tx.suppressionJournalEntry.update({
      where: { id: created.id },
      data: { entryHash },
    });
    await tx.suppressionJournalHead.update({
      where: { id: "global" },
      data: { lastSequence: sequence, lastHash: entryHash },
    });
    return entry;
  }

  private json(value: unknown) {
    return JSON.parse(JSON.stringify(value));
  }

  private async mutation<T>(
    actor: AuthUser,
    key: string,
    type: TipoOperacionRetencion,
    payload: unknown,
    run: (tx: any) => Promise<{ data: T; loteId?: string }>,
  ): Promise<T> {
    this.active(actor);
    const requestHash = this.fingerprint(type, payload);
    const execute = () =>
      this.prisma.$transaction(async (tx) => {
        const existing = await tx.operacionRetencion.findUnique({
          where: { actorId_key: { actorId: actor.id, key } },
        });
        if (existing) {
          if (existing.tipo !== type || existing.requestHash !== requestHash)
            throw api("IDEMPOTENCY_KEY_REUSED");
          if (existing.response == null)
            throw api("RETENTION_OPERATION_INCOMPLETE");
          return existing.response as T;
        }
        const operation = await tx.operacionRetencion.create({
          data: { actorId: actor.id, key, requestHash, tipo: type },
        });
        const result = await run(tx);
        const response = this.json(result.data);
        await tx.operacionRetencion.update({
          where: { id: operation.id },
          data: { response, loteId: result.loteId },
        });
        return response as T;
      });
    try {
      return await execute();
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const existing = await this.prisma.operacionRetencion.findUnique({
        where: { actorId_key: { actorId: actor.id, key } },
      });
      if (!existing) throw error;
      if (existing.tipo !== type || existing.requestHash !== requestHash)
        throw api("IDEMPOTENCY_KEY_REUSED");
      if (existing.response == null)
        throw api("RETENTION_OPERATION_INCOMPLETE");
      return existing.response as T;
    }
  }

  private institutionalPoliciesApproved() {
    return this.config.get("RETENTION_INSTITUTIONAL_POLICIES_APPROVED");
  }

  private validateProvisionalRule(input: RetentionRuleCreateInput) {
    if (!input.provisional) return;
    const policy = provisionalPolicies.get(input.categoria);
    if (!policy || policy.action !== input.accionFinal)
      throw api("RETENTION_PROVISIONAL_POLICY_INVALID", HttpStatus.BAD_REQUEST);
  }

  private policyExecutable(rule: {
    estado: EstadoReglaRetencion;
    provisional: boolean;
    approvedAt?: Date | null;
  }) {
    const approvedSnapshot =
      rule.estado === EstadoReglaRetencion.APROBADA ||
      (rule.estado === EstadoReglaRetencion.SUSTITUIDA &&
        rule.approvedAt != null);
    return (
      approvedSnapshot &&
      (rule.provisional || this.institutionalPoliciesApproved())
    );
  }

  private effectiveCutoff(cutoffAt: Date) {
    const now = new Date();
    if (cutoffAt.getTime() > now.getTime())
      throw api("SUPPRESSION_CUTOFF_IN_FUTURE", HttpStatus.BAD_REQUEST);
    return { cutoffAt: new Date(cutoffAt), now };
  }

  async listRules(actor: AuthUser, input: RetentionRuleListInput) {
    this.require(actor, Permission.RETENTION_READ);
    const where = input.categoria ? { categoria: input.categoria } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.reglaRetencion.findMany({
        where,
        include: ruleInclude,
        orderBy: [{ categoria: "asc" }, { version: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.reglaRetencion.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async createRule(
    actor: AuthUser,
    input: RetentionRuleCreateInput,
    key: string,
  ) {
    this.require(actor, Permission.RETENTION_MANAGE);
    this.validateProvisionalRule(input);
    if (input.automatica && !input.provisional)
      throw api("RETENTION_AUTOMATION_BLOCKED", HttpStatus.BAD_REQUEST);
    try {
      return await this.mutation(
        actor,
        key,
        TipoOperacionRetencion.CREAR_REGLA,
        input,
        async (tx) => {
          await tx.$executeRaw`SELECT id FROM ReglaRetencion WHERE categoria=${input.categoria} FOR UPDATE`;
          const latest = await tx.reglaRetencion.aggregate({
            where: { categoria: input.categoria },
            _max: { version: true },
          });
          const rule = await tx.reglaRetencion.create({
            data: {
              ...input,
              version: (latest._max.version ?? 0) + 1,
              creadoPorId: actor.id,
            },
            include: ruleInclude,
          });
          await this.audit.append(
            {
              actorId: actor.id,
              action: "RETENTION_RULE_VERSION_CREATED",
              resource: "retention_rule",
              correlationId: rule.id,
              metadata: {
                category: rule.categoria,
                version: rule.version,
                provisional: rule.provisional,
                automatic: rule.automatica,
              },
            },
            tx,
          );
          return { data: rule };
        },
      );
    } catch (error) {
      if ((error as { code?: string }).code === "P2002")
        throw api("RETENTION_RULE_VERSION_CONFLICT");
      throw error;
    }
  }

  async approveRule(
    actor: AuthUser,
    id: string,
    referenciaAprobacion: string,
    key: string,
  ) {
    this.require(actor, Permission.RETENTION_MANAGE);
    this.id(id);
    return this.mutation(
      actor,
      key,
      TipoOperacionRetencion.APROBAR_REGLA,
      { id, referenciaAprobacion },
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM ReglaRetencion WHERE id=${id} FOR UPDATE`;
        const current = await tx.reglaRetencion.findUnique({ where: { id } });
        if (!current)
          throw api("RETENTION_RULE_NOT_FOUND", HttpStatus.NOT_FOUND);
        if (current.estado !== EstadoReglaRetencion.BORRADOR)
          throw api("RETENTION_RULE_STATE_INVALID");
        if (!current.provisional && !this.institutionalPoliciesApproved())
          throw api("RETENTION_INSTITUTIONAL_APPROVAL_REQUIRED");
        await tx.reglaRetencion.updateMany({
          where: {
            categoria: current.categoria,
            estado: EstadoReglaRetencion.APROBADA,
          },
          data: { estado: EstadoReglaRetencion.SUSTITUIDA },
        });
        const rule = await tx.reglaRetencion.update({
          where: { id },
          data: {
            estado: EstadoReglaRetencion.APROBADA,
            aprobadoPorId: actor.id,
            approvedAt: new Date(),
            referenciaAprobacion,
          },
          include: ruleInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            action: "RETENTION_RULE_APPROVED",
            resource: "retention_rule",
            correlationId: id,
            metadata: {
              category: rule.categoria,
              version: rule.version,
              provisional: rule.provisional,
            },
          },
          tx,
        );
        return { data: rule };
      },
    );
  }

  private async resourceExists(client: any, input: RetentionRecordCreateInput) {
    const policy = provisionalPolicies.get(input.categoria);
    if (policy && !policy.resources.includes(input.resourceType))
      throw api("RETENTION_RESOURCE_TYPE_INVALID", HttpStatus.BAD_REQUEST);
    if (!policy) return true;
    switch (input.resourceType) {
      case "Session":
        return Boolean(
          await client.session.findUnique({
            where: { id: input.resourceId },
            select: { id: true },
          }),
        );
      case "RecoveryToken":
        return Boolean(
          await client.recoveryToken.findUnique({
            where: { id: input.resourceId },
            select: { id: true },
          }),
        );
      case "MfaChallenge":
        return Boolean(
          await client.mfaChallenge.findUnique({
            where: { id: input.resourceId },
            select: { id: true },
          }),
        );
      case "Notification":
        return Boolean(
          await client.notification.findUnique({
            where: { id: input.resourceId },
            select: { id: true },
          }),
        );
      case "ReporteExportacion":
        return Boolean(
          await client.reporteExportacion.findUnique({
            where: { id: input.resourceId },
            select: { id: true },
          }),
        );
      case "Archivo":
        return Boolean(
          await client.archivo.findFirst({
            where: { id: input.resourceId, status: EstadoArchivo.RECHAZADO },
            select: { id: true },
          }),
        );
      case "TechnicalLog":
        return true;
      default:
        return false;
    }
  }

  async registerRecord(
    actor: AuthUser,
    input: RetentionRecordCreateInput,
    key: string,
  ) {
    this.require(actor, Permission.RETENTION_MANAGE);
    return this.mutation(
      actor,
      key,
      TipoOperacionRetencion.REGISTRAR_ELEMENTO,
      input,
      async (tx) => {
        const existing = await tx.registroRetencion.findUnique({
          where: {
            categoria_resourceType_resourceId: {
              categoria: input.categoria,
              resourceType: input.resourceType,
              resourceId: input.resourceId,
            },
          },
          include: recordInclude,
        });
        if (existing) return { data: existing };
        const rule = await tx.reglaRetencion.findFirst({
          where: {
            categoria: input.categoria,
            estado: EstadoReglaRetencion.APROBADA,
          },
          orderBy: { version: "desc" },
        });
        if (!rule) throw api("RETENTION_APPROVED_RULE_REQUIRED");
        if (!this.policyExecutable(rule))
          throw api("RETENTION_INSTITUTIONAL_APPROVAL_REQUIRED");
        if (!(await this.resourceExists(tx, input)))
          throw api("RETENTION_RESOURCE_NOT_FOUND", HttpStatus.NOT_FOUND);
        const archiveDueAt = new Date(
          input.triggeredAt.getTime() + rule.periodoActivoDias * DAY_MS,
        );
        const actionDueAt = new Date(
          archiveDueAt.getTime() + rule.periodoBloqueadoDias * DAY_MS,
        );
        const record = await tx.registroRetencion.create({
          data: {
            ...input,
            reglaId: rule.id,
            archiveDueAt,
            actionDueAt,
          },
          include: recordInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: input.subjectId,
            action: "RETENTION_RECORD_REGISTERED",
            resource: "retention_record",
            correlationId: record.id,
            metadata: {
              category: record.categoria,
              resourceType: record.resourceType,
              policyVersion: rule.version,
              archiveDueAt: archiveDueAt.toISOString(),
              actionDueAt: actionDueAt.toISOString(),
            },
          },
          tx,
        );
        return { data: record };
      },
    );
  }

  async listRecords(actor: AuthUser, input: RetentionRecordListInput) {
    this.require(actor, Permission.RETENTION_READ);
    const where = {
      ...(input.categoria ? { categoria: input.categoria } : {}),
      ...(input.estado ? { estado: input.estado } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.registroRetencion.findMany({
        where,
        include: recordInclude,
        orderBy: [{ actionDueAt: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.registroRetencion.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async advanceLifecycle(limit = 100) {
    const now = new Date();
    const records = await this.prisma.registroRetencion.findMany({
      where: {
        estado: EstadoRegistroRetencion.ACTIVO,
        archiveDueAt: { lte: now },
      },
      select: { id: true, subjectId: true, categoria: true },
      orderBy: { archiveDueAt: "asc" },
      take: Math.min(100, Math.max(1, limit)),
    });
    let advanced = 0;
    for (const record of records) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.registroRetencion.updateMany({
          where: {
            id: record.id,
            estado: EstadoRegistroRetencion.ACTIVO,
            archiveDueAt: { lte: new Date() },
          },
          data: {
            estado: EstadoRegistroRetencion.BLOQUEADO_ARCHIVADO,
            blockedAt: new Date(),
          },
        });
        if (!updated.count) return;
        advanced += 1;
        await this.audit.append(
          {
            subjectId: record.subjectId ?? undefined,
            action: "RETENTION_RECORD_ARCHIVED",
            resource: "retention_record",
            correlationId: record.id,
            metadata: { category: record.categoria, result: "archived" },
          },
          tx,
        );
      });
    }
    return advanced;
  }

  async createLegalHold(
    actor: AuthUser,
    input: LegalHoldCreateInput,
    key: string,
  ) {
    this.require(actor, Permission.RETENTION_MANAGE);
    this.id(input.registroId);
    if (input.reviewAt <= new Date())
      throw api("RETENTION_LEGAL_HOLD_REVIEW_INVALID", HttpStatus.BAD_REQUEST);
    if (input.reviewAt.getTime() > Date.now() + 366 * DAY_MS)
      throw api("RETENTION_LEGAL_HOLD_REVIEW_TOO_FAR", HttpStatus.BAD_REQUEST);
    return this.mutation(
      actor,
      key,
      TipoOperacionRetencion.CREAR_RETENCION_LEGAL,
      input,
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM RegistroRetencion WHERE id=${input.registroId} FOR UPDATE`;
        const record = await tx.registroRetencion.findUnique({
          where: { id: input.registroId },
        });
        if (!record)
          throw api("RETENTION_RECORD_NOT_FOUND", HttpStatus.NOT_FOUND);
        if (
          [
            EstadoRegistroRetencion.SUPRIMIDO,
            EstadoRegistroRetencion.ANONIMIZADO,
          ].includes(record.estado)
        )
          throw api("RETENTION_RECORD_TERMINAL");
        const processing = await tx.elementoLoteSupresion.findFirst({
          where: {
            registroId: input.registroId,
            estado: EstadoElementoSupresion.PROCESANDO,
          },
          select: { id: true },
        });
        if (processing) throw api("RETENTION_SUPPRESSION_IN_PROGRESS");
        const active = await tx.retencionLegal.findFirst({
          where: {
            registroId: input.registroId,
            estado: EstadoRetencionLegal.ACTIVA,
          },
        });
        if (active) throw api("RETENTION_LEGAL_HOLD_ALREADY_ACTIVE");
        const hold = await tx.retencionLegal.create({
          data: { ...input, creadoPorId: actor.id },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: record.subjectId ?? undefined,
            action: "RETENTION_LEGAL_HOLD_CREATED",
            resource: "retention_legal_hold",
            correlationId: hold.id,
            metadata: {
              recordId: record.id,
              reviewAt: hold.reviewAt.toISOString(),
              responsible: hold.responsable,
            },
          },
          tx,
        );
        return { data: hold };
      },
    );
  }

  async listLegalHolds(actor: AuthUser, input: LegalHoldListInput) {
    this.require(actor, Permission.RETENTION_READ);
    const where = {
      ...(input.estado ? { estado: input.estado } : {}),
      ...(input.registroId ? { registroId: input.registroId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.retencionLegal.findMany({
        where,
        include: {
          creadoPor: { select: { id: true, codigo: true } },
          liberadoPor: { select: { id: true, codigo: true } },
          registro: {
            select: {
              id: true,
              categoria: true,
              resourceType: true,
              resourceId: true,
              subjectId: true,
              estado: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.retencionLegal.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async releaseLegalHold(
    actor: AuthUser,
    id: string,
    motivo: string,
    key: string,
  ) {
    this.require(actor, Permission.RETENTION_MANAGE);
    this.id(id);
    return this.mutation(
      actor,
      key,
      TipoOperacionRetencion.LIBERAR_RETENCION_LEGAL,
      { id, motivo },
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM RetencionLegal WHERE id=${id} FOR UPDATE`;
        const hold = await tx.retencionLegal.findUnique({
          where: { id },
          include: { registro: { select: { subjectId: true } } },
        });
        if (!hold)
          throw api("RETENTION_LEGAL_HOLD_NOT_FOUND", HttpStatus.NOT_FOUND);
        if (hold.estado !== EstadoRetencionLegal.ACTIVA)
          throw api("RETENTION_LEGAL_HOLD_ALREADY_RELEASED");
        const released = await tx.retencionLegal.update({
          where: { id },
          data: {
            estado: EstadoRetencionLegal.LIBERADA,
            liberadoPorId: actor.id,
            motivoLiberacion: motivo,
            releasedAt: new Date(),
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: hold.registro.subjectId ?? undefined,
            action: "RETENTION_LEGAL_HOLD_RELEASED",
            resource: "retention_legal_hold",
            correlationId: id,
            metadata: { recordId: hold.registroId, reason: motivo },
          },
          tx,
        );
        return { data: released };
      },
    );
  }

  async createRequest(actor: AuthUser, motivo: string, key: string) {
    this.request(actor);
    return this.mutation(
      actor,
      key,
      TipoOperacionRetencion.CREAR_SOLICITUD,
      { motivo },
      async (tx) => {
        const open = await tx.solicitudSupresion.findFirst({
          where: {
            solicitanteId: actor.id,
            estado: {
              in: [
                EstadoSolicitudSupresion.ABIERTA,
                EstadoSolicitudSupresion.EN_REVISION,
              ],
            },
          },
        });
        if (open) throw api("SUPPRESSION_REQUEST_ALREADY_OPEN");
        const request = await tx.solicitudSupresion.create({
          data: { solicitanteId: actor.id, motivo },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: actor.id,
            action: "SUPPRESSION_REQUEST_CREATED",
            resource: "suppression_request",
            correlationId: request.id,
            metadata: { result: request.estado },
          },
          tx,
        );
        return { data: request };
      },
    );
  }

  async myRequests(actor: AuthUser) {
    this.request(actor);
    return this.prisma.solicitudSupresion.findMany({
      where: { solicitanteId: actor.id },
      select: {
        id: true,
        motivo: true,
        estado: true,
        clasificacion: true,
        resolucion: true,
        resolvedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async listRequests(actor: AuthUser, input: SuppressionRequestListInput) {
    this.require(actor, Permission.RETENTION_READ);
    const where = input.estado ? { estado: input.estado } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.solicitudSupresion.findMany({
        where,
        include: {
          solicitante: { select: { id: true, codigo: true } },
          resueltoPor: { select: { id: true, codigo: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.solicitudSupresion.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async resolveRequest(
    actor: AuthUser,
    id: string,
    input: SuppressionRequestResolveInput,
    key: string,
  ) {
    this.require(actor, Permission.RETENTION_MANAGE);
    this.id(id);
    return this.mutation(
      actor,
      key,
      TipoOperacionRetencion.RESOLVER_SOLICITUD,
      { id, ...input },
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM SolicitudSupresion WHERE id=${id} FOR UPDATE`;
        const current = await tx.solicitudSupresion.findUnique({
          where: { id },
        });
        if (!current)
          throw api("SUPPRESSION_REQUEST_NOT_FOUND", HttpStatus.NOT_FOUND);
        if (
          ![
            EstadoSolicitudSupresion.ABIERTA,
            EstadoSolicitudSupresion.EN_REVISION,
          ].includes(current.estado)
        )
          throw api("SUPPRESSION_REQUEST_STATE_INVALID");
        const estado =
          input.decision === "REVIEW"
            ? EstadoSolicitudSupresion.EN_REVISION
            : input.decision === "APPROVE"
              ? EstadoSolicitudSupresion.APROBADA
              : EstadoSolicitudSupresion.RECHAZADA;
        const terminal = estado !== EstadoSolicitudSupresion.EN_REVISION;
        const request = await tx.solicitudSupresion.update({
          where: { id },
          data: {
            estado,
            clasificacion: input.clasificacion,
            resolucion: input.resolucion,
            resueltoPorId: terminal ? actor.id : null,
            resolvedAt: terminal ? new Date() : null,
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: current.solicitanteId,
            action: "SUPPRESSION_REQUEST_RESOLVED",
            resource: "suppression_request",
            correlationId: id,
            metadata: {
              result: estado,
              categories: input.clasificacion,
              reason: input.resolucion,
            },
          },
          tx,
        );
        await this.notifications.create(
          current.solicitanteId,
          "SUPPRESSION_REQUEST_RESOLVED",
          { requestId: id, estado },
          tx,
        );
        return { data: request };
      },
    );
  }

  async createBatch(
    actor: AuthUser,
    input: SuppressionBatchCreateInput,
    key: string,
  ) {
    this.require(actor, Permission.RETENTION_MANAGE);
    const { cutoffAt } = this.effectiveCutoff(input.cutoffAt);
    await this.advanceLifecycle(input.limit);
    return this.mutation(
      actor,
      key,
      TipoOperacionRetencion.CREAR_LOTE,
      input,
      async (tx) => {
        const candidates = await tx.registroRetencion.findMany({
          where: {
            estado: EstadoRegistroRetencion.BLOQUEADO_ARCHIVADO,
            actionDueAt: { lte: cutoffAt },
            ...(input.categoria ? { categoria: input.categoria } : {}),
            retencionesLegales: {
              none: { estado: EstadoRetencionLegal.ACTIVA },
            },
            elementosLote: {
              none: {
                lote: {
                  estado: { in: [...ACTIVE_SUPPRESSION_BATCH_STATES] },
                },
              },
            },
          },
          select: { id: true },
          orderBy: [{ actionDueAt: "asc" }, { id: "asc" }],
          take: input.limit,
        });
        if (!candidates.length)
          throw api("SUPPRESSION_BATCH_EMPTY", HttpStatus.BAD_REQUEST);
        for (const candidate of [...candidates].sort((left, right) =>
          left.id.localeCompare(right.id),
        ))
          await tx.$executeRaw`SELECT id FROM RegistroRetencion WHERE id=${candidate.id} FOR UPDATE`;
        const records = await tx.registroRetencion.findMany({
          where: {
            id: { in: candidates.map((record: { id: string }) => record.id) },
            estado: EstadoRegistroRetencion.BLOQUEADO_ARCHIVADO,
            actionDueAt: { lte: cutoffAt },
            ...(input.categoria ? { categoria: input.categoria } : {}),
            retencionesLegales: {
              none: { estado: EstadoRetencionLegal.ACTIVA },
            },
            elementosLote: {
              none: {
                lote: {
                  estado: { in: [...ACTIVE_SUPPRESSION_BATCH_STATES] },
                },
              },
            },
          },
          select: { id: true },
          orderBy: [{ actionDueAt: "asc" }, { id: "asc" }],
          take: input.limit,
        });
        if (!records.length)
          throw api("SUPPRESSION_BATCH_EMPTY", HttpStatus.BAD_REQUEST);
        const batch = await tx.loteSupresion.create({
          data: {
            categoria: input.categoria,
            cutoffAt,
            totalElementos: records.length,
            creadoPorId: actor.id,
            elementos: {
              create: records.map((record: { id: string }) => ({
                registroId: record.id,
              })),
            },
          },
          include: batchInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            action: "SUPPRESSION_BATCH_PREVIEW_CREATED",
            resource: "suppression_batch",
            correlationId: batch.id,
            metadata: {
              category: input.categoria ?? "ALL",
              cutoffAt: cutoffAt.toISOString(),
              total: records.length,
            },
          },
          tx,
        );
        return { data: batch, loteId: batch.id };
      },
    );
  }

  async listBatches(actor: AuthUser, input: SuppressionBatchListInput) {
    this.require(actor, Permission.RETENTION_READ);
    const where = {
      ...(input.categoria ? { categoria: input.categoria } : {}),
      ...(input.estado ? { estado: input.estado } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.loteSupresion.findMany({
        where,
        include: batchInclude,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.loteSupresion.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async batchDetail(actor: AuthUser, id: string) {
    this.require(actor, Permission.RETENTION_READ);
    this.id(id);
    const batch = await this.prisma.loteSupresion.findUnique({
      where: { id },
      include: batchInclude,
    });
    if (!batch) throw api("SUPPRESSION_BATCH_NOT_FOUND", HttpStatus.NOT_FOUND);
    return batch;
  }

  async authorizeBatch(actor: AuthUser, id: string, key: string) {
    this.require(actor, Permission.RETENTION_EXECUTE);
    this.id(id);
    return this.mutation(
      actor,
      key,
      TipoOperacionRetencion.AUTORIZAR_LOTE,
      { id },
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM LoteSupresion WHERE id=${id} FOR UPDATE`;
        const current = await tx.loteSupresion.findUnique({
          where: { id },
          include: {
            elementos: {
              include: { registro: { include: { regla: true } } },
            },
          },
        });
        if (!current)
          throw api("SUPPRESSION_BATCH_NOT_FOUND", HttpStatus.NOT_FOUND);
        if (current.estado !== EstadoLoteSupresion.BORRADOR)
          throw api("SUPPRESSION_BATCH_STATE_INVALID");
        if (!current.elementos.length)
          throw api("SUPPRESSION_BATCH_EMPTY", HttpStatus.BAD_REQUEST);
        const { cutoffAt } = this.effectiveCutoff(current.cutoffAt);
        const recordIds = current.elementos
          .map((item: any) => item.registroId)
          .sort((left: string, right: string) => left.localeCompare(right));
        if (current.totalElementos !== recordIds.length)
          throw api("SUPPRESSION_BATCH_STALE");
        for (const recordId of recordIds)
          await tx.$executeRaw`SELECT id FROM RegistroRetencion WHERE id=${recordId} FOR UPDATE`;
        const eligibleRecords = await tx.registroRetencion.findMany({
          where: {
            id: { in: recordIds },
            estado: EstadoRegistroRetencion.BLOQUEADO_ARCHIVADO,
            actionDueAt: { lte: cutoffAt },
            retencionesLegales: {
              none: { estado: EstadoRetencionLegal.ACTIVA },
            },
            elementosLote: {
              none: {
                loteId: { not: id },
                lote: {
                  estado: { in: [...ACTIVE_SUPPRESSION_BATCH_STATES] },
                },
              },
            },
          },
          include: { regla: true },
        });
        if (eligibleRecords.length !== recordIds.length)
          throw api("SUPPRESSION_BATCH_STALE");
        if (
          eligibleRecords.some(
            (record: any) => !this.policyExecutable(record.regla),
          )
        )
          throw api("RETENTION_INSTITUTIONAL_APPROVAL_REQUIRED");
        const scheduledAt = new Date();
        const scheduled = await tx.registroRetencion.updateMany({
          where: {
            id: { in: recordIds },
            estado: EstadoRegistroRetencion.BLOQUEADO_ARCHIVADO,
            actionDueAt: { lte: cutoffAt },
          },
          data: {
            estado: EstadoRegistroRetencion.SUPRESION_PROGRAMADA,
            scheduledAt,
          },
        });
        if (scheduled.count !== recordIds.length)
          throw api("SUPPRESSION_BATCH_STALE");
        const batch = await tx.loteSupresion.update({
          where: { id },
          data: {
            estado: EstadoLoteSupresion.AUTORIZADO,
            autorizadoPorId: actor.id,
            authorizedAt: new Date(),
          },
          include: batchInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            action: "SUPPRESSION_BATCH_AUTHORIZED",
            resource: "suppression_batch",
            correlationId: id,
            metadata: { total: current.totalElementos },
          },
          tx,
        );
        return { data: batch, loteId: id };
      },
    );
  }

  async pauseBatch(actor: AuthUser, id: string, motivo: string, key: string) {
    this.require(actor, Permission.RETENTION_EXECUTE);
    this.id(id);
    return this.mutation(
      actor,
      key,
      TipoOperacionRetencion.PAUSAR_LOTE,
      { id, motivo },
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM LoteSupresion WHERE id=${id} FOR UPDATE`;
        const current = await tx.loteSupresion.findUnique({ where: { id } });
        if (!current)
          throw api("SUPPRESSION_BATCH_NOT_FOUND", HttpStatus.NOT_FOUND);
        if (
          ![
            EstadoLoteSupresion.AUTORIZADO,
            EstadoLoteSupresion.EN_EJECUCION,
          ].includes(current.estado)
        )
          throw api("SUPPRESSION_BATCH_STATE_INVALID");
        const batch = await tx.loteSupresion.update({
          where: { id },
          data: {
            estado: EstadoLoteSupresion.PAUSADO,
            pausedAt: new Date(),
            motivoPausa: motivo,
          },
          include: batchInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            action: "SUPPRESSION_BATCH_PAUSED",
            resource: "suppression_batch",
            correlationId: id,
            metadata: { reason: motivo },
          },
          tx,
        );
        return { data: batch, loteId: id };
      },
    );
  }

  async retryBatch(actor: AuthUser, id: string, key: string) {
    this.require(actor, Permission.RETENTION_EXECUTE);
    this.id(id);
    const accepted = await this.mutation(
      actor,
      key,
      TipoOperacionRetencion.EJECUTAR_LOTE,
      { id, retry: true },
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM LoteSupresion WHERE id=${id} FOR UPDATE`;
        const current = await tx.loteSupresion.findUnique({ where: { id } });
        if (!current)
          throw api("SUPPRESSION_BATCH_NOT_FOUND", HttpStatus.NOT_FOUND);
        if (
          ![EstadoLoteSupresion.FALLIDO, EstadoLoteSupresion.PAUSADO].includes(
            current.estado,
          )
        )
          throw api("SUPPRESSION_BATCH_STATE_INVALID");
        const reset = await tx.elementoLoteSupresion.updateMany({
          where: { loteId: id, estado: EstadoElementoSupresion.FALLIDO },
          data: {
            estado: EstadoElementoSupresion.PENDIENTE,
            attempts: 0,
            nextAttemptAt: null,
            leaseUntil: null,
            leaseOwner: null,
            errorCode: null,
            processedAt: null,
          },
        });
        const batch = await tx.loteSupresion.update({
          where: { id },
          data: {
            estado: EstadoLoteSupresion.AUTORIZADO,
            fallidos: 0,
            pausedAt: null,
            motivoPausa: null,
            finishedAt: null,
          },
          include: batchInclude,
        });
        await this.audit.append(
          {
            actorId: actor.id,
            action: "SUPPRESSION_BATCH_RETRY_REQUESTED",
            resource: "suppression_batch",
            correlationId: id,
            metadata: { resetFailures: reset.count },
          },
          tx,
        );
        return {
          data: { id: batch.id, accepted: true, resetFailures: reset.count },
          loteId: id,
        };
      },
    );
    await this.processBatch(id);
    return accepted;
  }

  private async executeAdapter(record: any) {
    if (!this.policyExecutable(record.regla))
      throw api("RETENTION_INSTITUTIONAL_APPROVAL_REQUIRED");
    const provisional = provisionalPolicies.get(record.categoria);
    if (!provisional || !provisional.resources.includes(record.resourceType))
      throw api("RETENTION_ADAPTER_UNAVAILABLE", HttpStatus.NOT_IMPLEMENTED);
    if (provisional.action !== record.regla.accionFinal)
      throw api("RETENTION_POLICY_ACTION_MISMATCH");
    switch (record.resourceType) {
      case "Session":
        await this.prisma.session.deleteMany({
          where: { id: record.resourceId },
        });
        return;
      case "RecoveryToken":
        await this.prisma.recoveryToken.deleteMany({
          where: { id: record.resourceId },
        });
        return;
      case "MfaChallenge":
        await this.prisma.mfaChallenge.deleteMany({
          where: { id: record.resourceId },
        });
        return;
      case "Notification":
        await this.prisma.notification.deleteMany({
          where: { id: record.resourceId },
        });
        return;
      case "ReporteExportacion": {
        const report = await this.prisma.reporteExportacion.findUnique({
          where: { id: record.resourceId },
          select: { archivoId: true },
        });
        if (report?.archivoId)
          await this.storage.removeGenerated(report.archivoId);
        await this.prisma.reporteExportacion.updateMany({
          where: { id: record.resourceId },
          data: {
            status: EstadoReporteExportacion.EXPIRADO,
            archivoId: null,
            errorCode: null,
          },
        });
        return;
      }
      case "Archivo": {
        const file = await this.prisma.archivo.findFirst({
          where: { id: record.resourceId, status: EstadoArchivo.RECHAZADO },
          select: { objectKey: true, quarantineKey: true },
        });
        if (!file) return;
        await this.objectStorage.delete("quarantine", file.quarantineKey);
        await this.objectStorage.delete("available", file.objectKey);
        await this.prisma.archivo.updateMany({
          where: { id: record.resourceId, status: EstadoArchivo.RECHAZADO },
          data: {
            propietarioId: null,
            originalName: "[SUPRIMIDO]",
            detectedMime: null,
            extension: null,
            sha256: null,
            lastError: null,
            status: EstadoArchivo.ELIMINADO,
          },
        });
        return;
      }
      default:
        throw api("RETENTION_ADAPTER_UNAVAILABLE", HttpStatus.NOT_IMPLEMENTED);
    }
  }

  private safeError(error: unknown) {
    if (error instanceof ApiException) return error.code.slice(0, 100);
    const value =
      typeof error === "object" && error && "name" in error
        ? String((error as { name?: unknown }).name)
        : "RetentionError";
    return value.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 100);
  }

  private leaseMs() {
    return Math.max(5_000, this.config.get("RETENTION_LEASE_MS"));
  }

  private async withLeaseHeartbeat<T>(
    itemId: string,
    owner: string,
    run: () => Promise<T>,
  ) {
    const leaseMs = this.leaseMs();
    const intervalMs = Math.max(1_000, Math.floor(leaseMs / 3));
    let leaseLost = false;
    let renewal = Promise.resolve();
    const renew = async () => {
      const updated = await this.prisma.elementoLoteSupresion.updateMany({
        where: {
          id: itemId,
          estado: EstadoElementoSupresion.PROCESANDO,
          leaseOwner: owner,
        },
        data: { leaseUntil: new Date(Date.now() + leaseMs) },
      });
      if (updated.count !== 1) leaseLost = true;
    };
    await renew();
    if (leaseLost) throw api("SUPPRESSION_ITEM_LEASE_LOST");
    const timer = setInterval(() => {
      renewal = renewal.then(renew).catch(() => {
        leaseLost = true;
      });
    }, intervalMs);
    timer.unref?.();
    try {
      const result = await run();
      await renewal;
      await renew();
      if (leaseLost) throw api("SUPPRESSION_ITEM_LEASE_LOST");
      return result;
    } finally {
      clearInterval(timer);
    }
  }

  private async processItem(batch: any, item: any) {
    const owner = randomUUID();
    const claim = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM LoteSupresion WHERE id=${batch.id} FOR UPDATE`;
      const liveBatch = await tx.loteSupresion.findUnique({
        where: { id: batch.id },
      });
      if (
        !liveBatch ||
        (liveBatch.estado !== EstadoLoteSupresion.AUTORIZADO &&
          liveBatch.estado !== EstadoLoteSupresion.EN_EJECUCION)
      )
        return null;
      await tx.$executeRaw`SELECT id FROM RegistroRetencion WHERE id=${item.registroId} FOR UPDATE`;
      const record = await tx.registroRetencion.findUnique({
        where: { id: item.registroId },
        include: { regla: true },
      });
      if (!record) return null;
      const hold = await tx.retencionLegal.findFirst({
        where: {
          registroId: item.registroId,
          estado: EstadoRetencionLegal.ACTIVA,
        },
        select: { id: true },
      });
      if (hold) {
        const updated = await tx.elementoLoteSupresion.updateMany({
          where: {
            id: item.id,
            estado: EstadoElementoSupresion.PENDIENTE,
          },
          data: {
            estado: EstadoElementoSupresion.OMITIDO_RETENCION_LEGAL,
            processedAt: new Date(),
            leaseOwner: null,
            leaseUntil: null,
            nextAttemptAt: null,
          },
        });
        if (!updated.count) return null;
        await tx.registroRetencion.updateMany({
          where: {
            id: item.registroId,
            estado: EstadoRegistroRetencion.SUPRESION_PROGRAMADA,
          },
          data: {
            estado: EstadoRegistroRetencion.BLOQUEADO_ARCHIVADO,
            scheduledAt: null,
          },
        });
        await this.audit.append(
          {
            actorId: batch.autorizadoPorId ?? undefined,
            subjectId: item.registro.subjectId ?? undefined,
            action: "SUPPRESSION_ITEM_SKIPPED_LEGAL_HOLD",
            resource: "retention_record",
            correlationId: item.registroId,
            metadata: { batchId: batch.id, holdId: hold.id },
          },
          tx,
        );
        return null;
      }
      const now = new Date();
      if (
        record.estado !== EstadoRegistroRetencion.SUPRESION_PROGRAMADA ||
        record.actionDueAt.getTime() > liveBatch.cutoffAt.getTime() ||
        record.actionDueAt.getTime() > now.getTime() ||
        !this.policyExecutable(record.regla)
      ) {
        await tx.elementoLoteSupresion.updateMany({
          where: {
            id: item.id,
            estado: EstadoElementoSupresion.PENDIENTE,
          },
          data: {
            estado: EstadoElementoSupresion.FALLIDO,
            errorCode: "SUPPRESSION_BATCH_STALE",
            processedAt: now,
            nextAttemptAt: null,
            leaseOwner: null,
            leaseUntil: null,
          },
        });
        return null;
      }
      const claimed = await tx.elementoLoteSupresion.updateMany({
        where: {
          id: item.id,
          estado: EstadoElementoSupresion.PENDIENTE,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        data: {
          estado: EstadoElementoSupresion.PROCESANDO,
          attempts: { increment: 1 },
          leaseOwner: owner,
          leaseUntil: new Date(now.getTime() + this.leaseMs()),
        },
      });
      if (!claimed.count) return null;
      return { batch: liveBatch, record };
    });
    if (!claim) return;
    try {
      await this.withLeaseHeartbeat(item.id, owner, () =>
        this.executeAdapter(claim.record),
      );
      const terminalState =
        claim.record.regla.accionFinal === AccionFinalRetencion.ANONIMIZAR
          ? EstadoRegistroRetencion.ANONIMIZADO
          : EstadoRegistroRetencion.SUPRIMIDO;
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM RegistroRetencion WHERE id=${item.registroId} FOR UPDATE`;
        const updated = await tx.elementoLoteSupresion.updateMany({
          where: {
            id: item.id,
            estado: EstadoElementoSupresion.PROCESANDO,
            leaseOwner: owner,
          },
          data: {
            estado: EstadoElementoSupresion.EJECUTADO,
            errorCode: null,
            processedAt: new Date(),
            leaseOwner: null,
            leaseUntil: null,
            nextAttemptAt: null,
          },
        });
        if (!updated.count) return;
        const registry = await tx.registroSupresion.upsert({
          where: {
            registroId_accion: {
              registroId: item.registroId,
              accion: claim.record.regla.accionFinal,
            },
          },
          create: {
            registroId: item.registroId,
            categoria: claim.record.categoria,
            resourceType: claim.record.resourceType,
            resourceFingerprint: createHash("sha256")
              .update(
                `${claim.record.categoria}:${claim.record.resourceType}:${claim.record.resourceId}`,
              )
              .digest("hex"),
            accion: claim.record.regla.accionFinal,
            policyVersion: claim.record.regla.version,
            loteId: batch.id,
            ejecutadoPorId: claim.batch.autorizadoPorId,
          },
          update: {},
        });
        await this.enqueueSuppressionJournal(tx, registry);
        const finalized = await tx.registroRetencion.updateMany({
          where: {
            id: item.registroId,
            estado: EstadoRegistroRetencion.SUPRESION_PROGRAMADA,
          },
          data: { estado: terminalState, processedAt: new Date() },
        });
        if (finalized.count !== 1) throw api("SUPPRESSION_BATCH_STALE");
        await this.audit.append(
          {
            actorId: claim.batch.autorizadoPorId ?? undefined,
            subjectId: claim.record.subjectId ?? undefined,
            action: "SUPPRESSION_ITEM_EXECUTED",
            resource: "retention_record",
            correlationId: item.registroId,
            metadata: {
              batchId: batch.id,
              category: claim.record.categoria,
              resourceType: claim.record.resourceType,
              action: claim.record.regla.accionFinal,
              policyVersion: claim.record.regla.version,
            },
          },
          tx,
        );
      });
    } catch (error) {
      const attempts = Number(item.attempts ?? 0) + 1;
      const exhausted = attempts >= this.config.get("RETENTION_MAX_ATTEMPTS");
      await this.prisma.elementoLoteSupresion.updateMany({
        where: {
          id: item.id,
          estado: EstadoElementoSupresion.PROCESANDO,
          leaseOwner: owner,
        },
        data: {
          estado: exhausted
            ? EstadoElementoSupresion.FALLIDO
            : EstadoElementoSupresion.PENDIENTE,
          errorCode: this.safeError(error),
          processedAt: exhausted ? new Date() : null,
          nextAttemptAt: exhausted
            ? null
            : new Date(
                Date.now() +
                  this.config.get("RETENTION_RETRY_BASE_MS") * attempts,
              ),
          leaseOwner: null,
          leaseUntil: null,
        },
      });
    }
  }

  async processBatch(id: string, limit?: number) {
    const size = Math.min(
      100,
      Math.max(1, limit ?? this.config.get("RETENTION_BATCH_SIZE")),
    );
    const expiredAt = new Date();
    const maxAttempts = this.config.get("RETENTION_MAX_ATTEMPTS");
    await this.prisma.elementoLoteSupresion.updateMany({
      where: {
        loteId: id,
        estado: EstadoElementoSupresion.PROCESANDO,
        leaseUntil: { lte: expiredAt },
        attempts: { gte: maxAttempts },
      },
      data: {
        estado: EstadoElementoSupresion.FALLIDO,
        errorCode: "SUPPRESSION_ITEM_LEASE_EXPIRED",
        processedAt: expiredAt,
        nextAttemptAt: null,
        leaseOwner: null,
        leaseUntil: null,
      },
    });
    await this.prisma.elementoLoteSupresion.updateMany({
      where: {
        loteId: id,
        estado: EstadoElementoSupresion.PROCESANDO,
        leaseUntil: { lte: expiredAt },
        attempts: { lt: maxAttempts },
      },
      data: {
        estado: EstadoElementoSupresion.PENDIENTE,
        leaseOwner: null,
        leaseUntil: null,
      },
    });
    const batch = await this.prisma.loteSupresion.findUnique({
      where: { id },
      include: {
        elementos: {
          where: {
            estado: EstadoElementoSupresion.PENDIENTE,
            OR: [
              { nextAttemptAt: null },
              { nextAttemptAt: { lte: new Date() } },
            ],
          },
          include: {
            registro: {
              include: { regla: true },
            },
          },
          orderBy: { createdAt: "asc" },
          take: size,
        },
      },
    });
    if (!batch) throw api("SUPPRESSION_BATCH_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (
      batch.estado !== EstadoLoteSupresion.AUTORIZADO &&
      batch.estado !== EstadoLoteSupresion.EN_EJECUCION
    )
      return batch;
    if (batch.estado === EstadoLoteSupresion.AUTORIZADO)
      await this.prisma.loteSupresion.updateMany({
        where: { id, estado: EstadoLoteSupresion.AUTORIZADO },
        data: {
          estado: EstadoLoteSupresion.EN_EJECUCION,
          startedAt: new Date(),
        },
      });
    for (const item of batch.elementos) {
      const current = await this.prisma.loteSupresion.findUnique({
        where: { id },
        select: { estado: true },
      });
      if (current?.estado === EstadoLoteSupresion.PAUSADO) break;
      await this.processItem(batch, item);
    }
    const states = await this.prisma.elementoLoteSupresion.findMany({
      where: { loteId: id },
      select: { estado: true },
    });
    const count = (state: EstadoElementoSupresion) =>
      states.filter((item) => item.estado === state).length;
    const pending =
      count(EstadoElementoSupresion.PENDIENTE) +
      count(EstadoElementoSupresion.PROCESANDO);
    const executed = count(EstadoElementoSupresion.EJECUTADO);
    const skipped = count(EstadoElementoSupresion.OMITIDO_RETENCION_LEGAL);
    const failed = count(EstadoElementoSupresion.FALLIDO);
    const final = pending === 0;
    return this.prisma.loteSupresion.update({
      where: { id },
      data: {
        ejecutados: executed,
        omitidos: skipped,
        fallidos: failed,
        ...(final
          ? {
              estado:
                failed > 0
                  ? EstadoLoteSupresion.FALLIDO
                  : EstadoLoteSupresion.COMPLETADO,
              finishedAt: new Date(),
            }
          : {}),
      },
      include: batchInclude,
    });
  }

  async executeBatch(actor: AuthUser, id: string, key: string) {
    this.require(actor, Permission.RETENTION_EXECUTE);
    this.id(id);
    await this.mutation(
      actor,
      key,
      TipoOperacionRetencion.EJECUTAR_LOTE,
      { id },
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM LoteSupresion WHERE id=${id} FOR UPDATE`;
        const batch = await tx.loteSupresion.findUnique({ where: { id } });
        if (!batch)
          throw api("SUPPRESSION_BATCH_NOT_FOUND", HttpStatus.NOT_FOUND);
        if (
          ![
            EstadoLoteSupresion.AUTORIZADO,
            EstadoLoteSupresion.EN_EJECUCION,
          ].includes(batch.estado)
        )
          throw api("SUPPRESSION_BATCH_STATE_INVALID");
        await this.audit.append(
          {
            actorId: actor.id,
            action: "SUPPRESSION_BATCH_EXECUTION_REQUESTED",
            resource: "suppression_batch",
            correlationId: id,
            metadata: { result: "accepted" },
          },
          tx,
        );
        return { data: { id, accepted: true }, loteId: id };
      },
    );
    return this.processBatch(id);
  }

  async processAuthorized(limit = 10) {
    await this.advanceLifecycle(limit * 10);
    const batches = await this.prisma.loteSupresion.findMany({
      where: {
        estado: {
          in: [
            EstadoLoteSupresion.AUTORIZADO,
            EstadoLoteSupresion.EN_EJECUCION,
          ],
        },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: Math.min(50, Math.max(1, limit)),
    });
    for (const batch of batches) await this.processBatch(batch.id);
    return batches.length;
  }

  async listRegistry(actor: AuthUser, input: SuppressionRegistryListInput) {
    this.require(actor, Permission.RETENTION_READ);
    const where = input.categoria ? { categoria: input.categoria } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.registroSupresion.findMany({
        where,
        select: {
          id: true,
          categoria: true,
          resourceType: true,
          resourceFingerprint: true,
          accion: true,
          policyVersion: true,
          loteId: true,
          occurredAt: true,
          lastReappliedAt: true,
        },
        orderBy: { occurredAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.registroSupresion.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async reapplyImportedJournal(
    actor: AuthUser,
    imported: Array<{ id: string; payload: unknown }>,
  ) {
    this.require(actor, Permission.RECOVERY_EXECUTE);
    const reappliedIds: string[] = [];
    const matches: Array<{ importedId: string; registroId: string }> = [];
    const failures: Array<{ importedId: string; errorCode: string }> = [];
    for (const entry of imported) {
      try {
        const payload = entry.payload as {
          category?: CategoriaRetencion;
          resourceType?: string;
          resourceFingerprint?: string;
          action?: AccionFinalRetencion;
          policyVersion?: number;
        };
        if (
          !payload.category ||
          !payload.resourceType ||
          !payload.resourceFingerprint ||
          !payload.action ||
          !payload.policyVersion
        )
          throw new Error("RECOVERY_JOURNAL_PAYLOAD_INVALID");
        const candidates = await this.prisma.registroRetencion.findMany({
          where: {
            categoria: payload.category,
            resourceType: payload.resourceType,
          },
          include: { regla: true },
          take: 10_000,
        });
        const record = candidates.find(
          (candidate) =>
            createHash("sha256")
              .update(
                `${candidate.categoria}:${candidate.resourceType}:${candidate.resourceId}`,
              )
              .digest("hex") === payload.resourceFingerprint,
        );
        if (!record) throw new Error("RECOVERY_SUPPRESSION_TARGET_NOT_FOUND");
        if (
          record.regla.accionFinal !== payload.action ||
          record.regla.version !== payload.policyVersion
        )
          throw new Error("RECOVERY_SUPPRESSION_POLICY_MISMATCH");
        await this.executeAdapter(record);
        await this.prisma.registroRetencion.update({
          where: { id: record.id },
          data: {
            estado:
              payload.action === AccionFinalRetencion.ANONIMIZAR
                ? EstadoRegistroRetencion.ANONIMIZADO
                : EstadoRegistroRetencion.SUPRIMIDO,
            processedAt: new Date(),
          },
        });
        reappliedIds.push(entry.id);
        matches.push({ importedId: entry.id, registroId: record.id });
      } catch (error) {
        failures.push({
          importedId: entry.id,
          errorCode: this.safeError(error),
        });
      }
    }
    return {
      total: imported.length,
      reapplied: reappliedIds.length,
      failed: failures.length,
      reappliedIds,
      matches,
      failures,
    };
  }

  async reapplySuppressed(actor: AuthUser, limit: number, key: string) {
    this.require(actor, Permission.RETENTION_EXECUTE);
    const type = TipoOperacionRetencion.REAPLICAR_SUPRESIONES;
    const effectiveLimit = Math.min(100, Math.max(1, limit));
    const requestHash = this.fingerprint(type, { limit: effectiveLimit });
    let operation: { id: string };
    try {
      operation = await this.prisma.operacionRetencion.create({
        data: {
          actorId: actor.id,
          key,
          requestHash,
          tipo: type,
        },
        select: { id: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const existing = await this.prisma.operacionRetencion.findUnique({
        where: { actorId_key: { actorId: actor.id, key } },
      });
      if (!existing) throw error;
      if (existing.tipo !== type || existing.requestHash !== requestHash)
        throw api("IDEMPOTENCY_KEY_REUSED");
      if (existing.response == null)
        throw api("RETENTION_OPERATION_INCOMPLETE");
      return existing.response;
    }
    const entries = await this.prisma.registroSupresion.findMany({
      include: { registro: { include: { regla: true } } },
      orderBy: [{ lastReappliedAt: "asc" }, { occurredAt: "asc" }],
      take: effectiveLimit,
    });
    let reapplied = 0;
    const failures: Array<{ registryId: string; errorCode: string }> = [];
    for (const entry of entries) {
      try {
        await this.executeAdapter(entry.registro);
        await this.prisma.registroSupresion.update({
          where: { id: entry.id },
          data: { lastReappliedAt: new Date() },
        });
        reapplied += 1;
      } catch (error) {
        failures.push({
          registryId: entry.id,
          errorCode: this.safeError(error),
        });
      }
    }
    const report = {
      accepted: true,
      limit: effectiveLimit,
      total: entries.length,
      reapplied,
      failed: failures.length,
      failures,
    };
    await this.prisma.$transaction(async (tx) => {
      await this.audit.append(
        {
          actorId: actor.id,
          action: "SUPPRESSION_REAPPLICATION_COMPLETED",
          resource: "suppression_registry",
          correlationId: operation.id,
          metadata: report,
        },
        tx,
      );
      await tx.operacionRetencion.update({
        where: { id: operation.id },
        data: { response: this.json(report) },
      });
    });
    return report;
  }
}
