import { createHash } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { requirePilot } from "../common/domain/operational-pilot";
import { operationalNotification } from "../common/domain/operational-notification";
import { z } from "zod";
import type { AuthUser } from "../auth/auth-user";
import { AuditService } from "../auth/audit.service";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../database/prisma.service";
import { DomainTransaction } from "../common/domain/domain-transaction";
import { Prisma } from "../generated/prisma/client";
import { AttendancePolicy } from "./attendance.policy";
import { publicAttendance, signalRisk } from "./attendance-signals";
import { contingencySchema } from "./attendance-contingency.schemas";
import {
  dailyCutoff,
  localParts,
  DEFAULT_RISK_RULES,
  evaluateRisk,
  riskRulesSchema,
  type ShiftSnapshot,
} from "./attendance-risk";
import {
  validationSchema,
  correctionSchema,
  batchValidationSchema,
  reviewQuerySchema,
  attendancePolicySchema,
} from "./attendance-review.schemas";

type Row = Prisma.AsistenciaGetPayload<{
  include: { user: { select: { codigo: true } } };
}>;
const includeUser = { user: { select: { codigo: true } } } as const;

@Injectable()
export class AttendanceReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AttendancePolicy,
    private readonly audit: AuditService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async queue(actor: AuthUser, query: z.infer<typeof reviewQuerySchema>) {
    const scope = this.policy.scope(actor);
    const { limit, cursor, ...filters } = query;
    if (
      (scope.sedeId !== undefined &&
        query.sedeId !== undefined &&
        scope.sedeId !== query.sedeId) ||
      (scope.areaId !== undefined &&
        query.areaId !== undefined &&
        scope.areaId !== query.areaId)
    )
      throw new ApiException("FORBIDDEN", 403);
    const rows = await this.prisma.asistencia.findMany({
      where: {
        ...filters,
        sedeId: scope.sedeId ?? query.sedeId,
        areaId: scope.areaId ?? query.areaId,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: includeUser,
      orderBy: { id: "desc" },
      take: limit + 1,
    });
    return {
      items: rows
        .slice(0, query.limit)
        .map((row) => ({ ...publicAttendance(row), risk: this.risk(row) })),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null,
    };
  }

  async history(actor: AuthUser, id: number) {
    const row = await this.prisma.asistencia.findUnique({ where: { id } });
    if (!row) throw new ApiException("ATTENDANCE_NOT_FOUND", 404);
    if (row.userId !== actor.id) this.policy.requireManage(actor, row);
    return {
      events: await this.prisma.asistenciaEvento.findMany({
        where: { attendanceId: id },
        orderBy: { id: "asc" },
      }),
      validations: await this.prisma.asistenciaValidacion.findMany({
        where: { attendanceId: id },
        orderBy: { id: "asc" },
      }),
    };
  }

  contingency(
    actor: AuthUser,
    key: string,
    input: z.infer<typeof contingencySchema>,
  ) {
    return this.mutate(
      actor,
      key,
      { action: "CONTINGENCY", ...input },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${input.userId} FOR UPDATE`;
        const owner = await tx.usuario.findUnique({
          where: { id: input.userId },
          include: {
            sede: true,
            area: true,
            turno: { include: { dias: true } },
          },
        });
        if (
          !owner ||
          !owner.sede?.activa ||
          !owner.area?.activa ||
          !owner.turno?.activo ||
          owner.area.sedeId !== owner.sede.id ||
          owner.turno.areaId !== owner.area.id
        )
          throw new ApiException("ATTENDANCE_ASSIGNMENT_REQUIRED", 409);
        this.policy.requireManage(actor, {
          sedeId: owner.sede.id,
          areaId: owner.area.id,
        });
        if (this.config) requirePilot(this.config, owner);
        if (owner.id === actor.id)
          throw new ApiException("ATTENDANCE_SELF_CONTINGENCY", 403);
        const start = new Date(input.checkInAt),
          end = new Date(input.checkOutAt);
        if (
          start >= end ||
          end > new Date() ||
          end > dailyCutoff(start) ||
          localParts(start).day !== input.date ||
          localParts(end).day !== input.date
        )
          throw new ApiException("ATTENDANCE_INTERVAL_INVALID", 400);
        if (
          await tx.asistencia.findFirst({
            where: {
              userId: owner.id,
              checkInAt: { lt: end },
              OR: [{ checkOutAt: null }, { checkOutAt: { gt: start } }],
            },
          })
        )
          throw new ApiException("ATTENDANCE_OVERLAP", 409);
        const policy = await tx.politicaAsistencia.findFirst({
          where: { sedeId: owner.sede.id },
          orderBy: { version: "desc" },
        });
        const row = await tx.asistencia.create({
          data: {
            userId: owner.id,
            sedeId: owner.sede.id,
            areaId: owner.area.id,
            turnoId: owner.turno.id,
            checkInAt: start,
            checkOutAt: end,
            durationSeconds: Math.floor(
              (end.getTime() - start.getTime()) / 1000,
            ),
            status: "PENDIENTE",
            isContingency: true,
            contingencyTicket: input.ticket,
            contingencyJustification: input.justification,
            closeReason: input.reason,
            closedById: actor.id,
            // No historical assignment ledger: do not present today's assignment as historical proof.
            shiftSnapshot: Prisma.JsonNull,
            policySnapshot: {
              version: policy?.version ?? 0,
              rules: policy?.rules ?? DEFAULT_RISK_RULES,
            },
          },
          include: includeUser,
        });
        const risk = this.risk(row);
        await tx.asistencia.update({
          where: { id: row.id },
          data: { riskSnapshot: risk },
        });
        await tx.asistenciaEvento.create({
          data: {
            attendanceId: row.id,
            actorId: actor.id,
            action: "CONTINGENCY",
            occurredAt: new Date(),
            reason: input.reason,
            metadata: { ticket: input.ticket },
          },
        });
        await this.record(
          tx,
          actor,
          row,
          "ATTENDANCE_CONTINGENCY_CREATED",
          input.reason,
          risk,
        );
        return { ...publicAttendance(row), risk };
      },
    );
  }

  async signals(actor: AuthUser, id: number) {
    const row = await this.prisma.asistencia.findUnique({ where: { id } });
    if (!row) throw new ApiException("ATTENDANCE_NOT_FOUND", 404);
    const scope = getAccessScope(actor, Permission.AUDIT_READ);
    if (
      !scope ||
      (scope === AccessScope.AREA && actor.areaId !== row.areaId) ||
      (scope === AccessScope.SEDE && actor.sedeId !== row.sedeId)
    )
      throw new ApiException("FORBIDDEN", 403);
    await this.audit.append({
      actorId: actor.id,
      actorRole: actor.rol,
      subjectId: row.userId,
      action: "ATTENDANCE_SIGNALS_READ",
      resource: "attendance",
      objectId: String(id),
      sedeId: row.sedeId,
      areaId: row.areaId,
    });
    return {
      clientIp: row.clientIp,
      geoLatitude: row.geoLatitude,
      geoLongitude: row.geoLongitude,
      geoAccuracyMeters: row.geoAccuracyMeters,
      locationRiskCode: row.locationRiskCode,
      checkout: row.checkoutSignal,
    };
  }

  validate(
    actor: AuthUser,
    id: number,
    key: string,
    input: z.infer<typeof validationSchema>,
  ) {
    return this.mutate(
      actor,
      key,
      { action: "VALIDATE", id, ...input },
      async (tx) => this.validateLocked(tx, actor, id, input),
    );
  }

  batch(
    actor: AuthUser,
    key: string,
    input: z.infer<typeof batchValidationSchema>,
  ) {
    return this.mutate(
      actor,
      key,
      { action: "BATCH_VALIDATE", ...input },
      async (tx) => {
        const results = [];
        // Deterministic lock order, all-or-nothing; do not silently skip stale entries.
        for (const item of [...input.items].sort((a, b) => a.id - b.id))
          results.push(
            await this.validateLocked(
              tx,
              actor,
              item.id,
              {
                version: item.version,
                reason: input.reason,
                decision: "AUTORIZADA",
              },
              true,
            ),
          );
        return { items: results };
      },
    );
  }

  correct(
    actor: AuthUser,
    id: number,
    key: string,
    input: z.infer<typeof correctionSchema>,
  ) {
    return this.mutate(
      actor,
      key,
      { action: "CORRECT", id, ...input },
      async (tx) => {
        const row = await this.lock(tx, actor, id, input.version);
        this.policy.requireManage(actor, row);
        if (row.status !== "PENDIENTE")
          throw new ApiException("ATTENDANCE_REVIEW_STATE_INVALID", 409);
        const start = new Date(input.checkInAt),
          end = new Date(input.checkOutAt);
        if (
          start >= end ||
          end > new Date() ||
          end > dailyCutoff(start) ||
          localParts(start).day !== localParts(row.checkInAt).day
        )
          throw new ApiException("ATTENDANCE_INTERVAL_INVALID", 400);
        const overlap = await tx.asistencia.findFirst({
          where: {
            userId: row.userId,
            id: { not: id },
            checkInAt: { lt: end },
            OR: [{ checkOutAt: null }, { checkOutAt: { gt: start } }],
          },
        });
        if (overlap) throw new ApiException("ATTENDANCE_OVERLAP", 409);
        const updated = await tx.asistencia.update({
          where: { id },
          data: {
            checkInAt: start,
            checkOutAt: end,
            durationSeconds: Math.floor(
              (end.getTime() - start.getTime()) / 1000,
            ),
            version: { increment: 1 },
            requiresReview: false,
          },
          include: includeUser,
        });
        const risk = this.risk(updated, true);
        await tx.asistencia.update({
          where: { id },
          data: { riskSnapshot: risk },
        });
        await tx.asistenciaEvento.create({
          data: {
            attendanceId: id,
            actorId: actor.id,
            action: "CORRECT",
            occurredAt: new Date(),
            reason: input.reason,
            metadata: {
              before: {
                checkInAt: row.checkInAt.toISOString(),
                checkOutAt: row.checkOutAt?.toISOString() ?? null,
              },
              after: {
                checkInAt: start.toISOString(),
                checkOutAt: end.toISOString(),
              },
              version: updated.version,
            },
          },
        });
        await this.record(
          tx,
          actor,
          updated,
          "ATTENDANCE_CORRECTED",
          input.reason,
          risk,
        );
        return { ...publicAttendance(updated), riskSnapshot: risk, risk };
      },
    );
  }

  async publishPolicy(
    actor: AuthUser,
    key: string,
    sedeId: number,
    input: z.infer<typeof attendancePolicySchema>,
  ) {
    const scope = getAccessScope(actor, Permission.ORGANIZATION_MANAGE);
    if (
      scope !== AccessScope.GLOBAL &&
      !(scope === AccessScope.SEDE && actor.sedeId === sedeId)
    )
      throw new ApiException("FORBIDDEN", 403);
    return new DomainTransaction(this.prisma).run(
      actor,
      key,
      { op: "attendance:policy", sedeId, input },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM Sede WHERE id = ${sedeId} FOR UPDATE`;
        if (!(await tx.sede.findUnique({ where: { id: sedeId } })))
          throw new ApiException("SEDE_NOT_FOUND", 404);
        const last = await tx.politicaAsistencia.findFirst({
          where: { sedeId },
          orderBy: { version: "desc" },
        });
        const row = await tx.politicaAsistencia.create({
          data: {
            sedeId,
            version: (last?.version ?? 0) + 1,
            rules: input.rules,
            locationRules:
              input.locationRules ?? last?.locationRules ?? Prisma.JsonNull,
            actorId: actor.id,
            reason: input.reason,
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            action: "ATTENDANCE_POLICY_PUBLISHED",
            resource: "attendance",
            sedeId,
            reason: input.reason,
            metadata: { version: row.version, rules: input.rules },
          },
          tx,
        );
        return row;
      },
    );
  }

  risk(
    row: Pick<
      Row,
      | "checkInAt"
      | "checkOutAt"
      | "requiresReview"
      | "shiftSnapshot"
      | "policySnapshot"
      | "riskSnapshot"
      | "locationRiskCode"
      | "checkoutSignal"
      | "isContingency"
    >,
    corrected = false,
  ) {
    const policy = (row.policySnapshot ?? {}) as {
      version?: number;
      rules?: unknown;
    };
    const parsed = riskRulesSchema.safeParse(
      policy.rules ?? DEFAULT_RISK_RULES,
    );
    const previous = row.riskSnapshot as { reasons?: string[] } | null;
    return signalRisk(
      evaluateRisk({
        start: row.checkInAt,
        end: row.checkOutAt ?? new Date(),
        omitted: row.requiresReview,
        corrected:
          corrected ||
          (previous?.reasons?.includes("SESION_CORREGIDA") ?? false),
        shift: row.shiftSnapshot as ShiftSnapshot | null,
        policyVersion: policy.version ?? 0,
        rules: parsed.success ? parsed.data : DEFAULT_RISK_RULES,
      }),
      [
        row.locationRiskCode,
        (row.checkoutSignal as { locationRiskCode?: string } | null)
          ?.locationRiskCode,
        row.isContingency ? "CAPTURA_CONTINGENCIA" : null,
      ],
    );
  }

  private async validateLocked(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    id: number,
    input: z.infer<typeof validationSchema>,
    batch = false,
  ) {
    const row = await this.lock(tx, actor, id, input.version);
    const scope = getAccessScope(actor, Permission.HOURS_VALIDATE);
    if (
      !scope ||
      (scope === AccessScope.AREA && actor.areaId !== row.areaId) ||
      (scope === AccessScope.SEDE && actor.sedeId !== row.sedeId)
    )
      throw new ApiException("FORBIDDEN", 403);
    if (row.userId === actor.id)
      throw new ApiException("ATTENDANCE_SELF_VALIDATION", 403);
    if (row.status !== "PENDIENTE")
      throw new ApiException("ATTENDANCE_REVIEW_STATE_INVALID", 409);
    if (
      await tx.asistenciaEvento.findFirst({
        where: {
          attendanceId: id,
          actorId: actor.id,
          action: { in: ["CORRECT", "MANUAL_CLOSE", "CONTINGENCY"] },
        },
      })
    )
      throw new ApiException("ATTENDANCE_CORRECTOR_VALIDATION", 403);
    const overlap = await tx.asistencia.findFirst({
      where: {
        id: { not: id },
        userId: row.userId,
        checkInAt: { lt: row.checkOutAt! },
        OR: [{ checkOutAt: null }, { checkOutAt: { gt: row.checkInAt } }],
      },
    });
    const risk = this.risk(row);
    if (overlap) {
      risk.color = "ROJO";
      risk.reasons.push("SOLAPAMIENTO");
    }
    if (batch && risk.color !== "VERDE")
      throw new ApiException("ATTENDANCE_BATCH_REQUIRES_GREEN", 409);
    if (input.decision === "AUTORIZADA" && row.requiresReview)
      throw new ApiException("ATTENDANCE_CORRECTION_REQUIRED", 409);
    await tx.asistenciaValidacion.create({
      data: {
        attendanceId: id,
        actorId: actor.id,
        decision: input.decision,
        previousVersion: row.version,
        reason: input.reason,
        riskSnapshot: risk,
      },
    });
    const updated = await tx.asistencia.update({
      where: { id },
      data: {
        status: input.decision,
        riskSnapshot: risk,
        version: { increment: 1 },
      },
      include: includeUser,
    });
    await this.record(
      tx,
      actor,
      updated,
      "ATTENDANCE_VALIDATED",
      input.reason,
      risk,
    );
    return { ...publicAttendance(updated), risk };
  }

  private async lock(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    id: number,
    version: number,
  ) {
    const target = await tx.asistencia.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!target) throw new ApiException("ATTENDANCE_NOT_FOUND", 404);
    await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${target.userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM Asistencia WHERE id = ${id} FOR UPDATE`;
    const row = await tx.asistencia.findUnique({
      where: { id },
      include: includeUser,
    });
    if (!row) throw new ApiException("ATTENDANCE_NOT_FOUND", 404);
    this.policy.requireManage(actor, row);
    if (row.version !== version)
      throw new ApiException("ATTENDANCE_VERSION_CHANGED", 409);
    return row;
  }

  private async record(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    row: Row,
    action:
      | "ATTENDANCE_CONTINGENCY_CREATED"
      | "ATTENDANCE_CORRECTED"
      | "ATTENDANCE_VALIDATED",
    reason: string,
    risk: ReturnType<AttendanceReviewService["risk"]>,
  ) {
    await this.audit.append(
      {
        actorId: actor.id,
        actorRole: actor.rol,
        subjectId: row.userId,
        action,
        resource: "attendance",
        objectId: String(row.id),
        sedeId: row.sedeId,
        areaId: row.areaId,
        reason,
        policyVersion: String(risk.policyVersion),
        metadata: { version: row.version, risk, status: row.status },
      },
      tx,
    );
    await operationalNotification(tx, row.userId, action, {
      attendanceId: row.id,
      status: row.status,
    });
  }

  private async mutate(
    actor: AuthUser,
    key: string,
    operation: object,
    apply: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(operation))
      .digest("hex");
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
            await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${actor.id} FOR UPDATE`;
            const fresh = await tx.usuario.findUnique({
              where: { id: actor.id },
            });
            if (
              !fresh ||
              fresh.estado !== "ACTIVA" ||
              fresh.rol !== actor.rol ||
              fresh.areaId !== actor.areaId ||
              fresh.sedeId !== actor.sedeId
            )
              throw new ApiException("UNAUTHORIZED", 401);
            const previous = await tx.asistenciaSolicitud.findUnique({
              where: { actorId_key: { actorId: actor.id, key } },
            });
            if (previous) {
              if (previous.fingerprint !== fingerprint)
                throw new ApiException("IDEMPOTENCY_KEY_REUSED", 409);
              return previous.response;
            }
            const result = await apply(tx);
            const response = JSON.parse(
              JSON.stringify(result),
            ) as Prisma.InputJsonValue;
            await tx.asistenciaSolicitud.create({
              data: { actorId: actor.id, key, fingerprint, response },
            });
            return response;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            timeout: 30000,
          },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2034", "P2002"].includes(error.code)
        ) {
          if (attempt < 2) continue;
          throw new ApiException("ATTENDANCE_RETRY_REQUIRED", 409);
        }
        throw error;
      }
    }
    throw new ApiException("ATTENDANCE_RETRY_REQUIRED", 409);
  }
}
