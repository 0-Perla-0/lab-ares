import type { AuditService } from "../auth/audit.service";
import type { Prisma } from "../generated/prisma/client";
import {
  dailyCutoff,
  evaluateRisk,
  DEFAULT_RISK_RULES,
  riskRulesSchema,
  type ShiftSnapshot,
} from "./attendance-risk";

/** Caller holds the user's row lock. Replay after a crash cannot close a record twice. */
export async function closeOverdue(
  tx: Prisma.TransactionClient,
  userId: number,
  now: Date,
  audit: AuditService,
) {
  const row = await tx.asistencia.findUnique({ where: { openUserId: userId } });
  if (!row) return false;
  const cutoff = new Date(
    Math.max(+row.checkInAt, +dailyCutoff(row.checkInAt)),
  );
  if (now < cutoff) return false;
  const policy = row.policySnapshot as {
    version?: number;
    rules?: unknown;
  } | null;
  const rules = riskRulesSchema.safeParse(policy?.rules ?? DEFAULT_RISK_RULES);
  const risk = evaluateRisk({
    start: row.checkInAt,
    end: cutoff,
    omitted: true,
    shift: row.shiftSnapshot as ShiftSnapshot | null,
    policyVersion: policy?.version ?? 0,
    rules: rules.success ? rules.data : DEFAULT_RISK_RULES,
  });
  await tx.asistencia.update({
    where: { id: row.id },
    data: {
      checkOutAt: cutoff,
      openUserId: null,
      status: "PENDIENTE",
      durationSeconds: Math.max(
        0,
        Math.floor((cutoff.getTime() - row.checkInAt.getTime()) / 1000),
      ),
      closeReason: "CHECKOUT_OMITIDO",
      closedById: null,
      requiresReview: true,
      riskSnapshot: risk,
      version: { increment: 1 },
    },
  });
  await tx.asistenciaEvento.create({
    data: {
      attendanceId: row.id,
      actorId: null,
      action: "DAILY_CUTOFF",
      occurredAt: now,
      reason: "CHECKOUT_OMITIDO",
      metadata: { cutoff: cutoff.toISOString(), risk },
    },
  });
  await audit.append(
    {
      actorType: "SYSTEM",
      subjectId: userId,
      action: "ATTENDANCE_DAILY_CUTOFF",
      resource: "attendance",
      objectId: String(row.id),
      sedeId: row.sedeId,
      areaId: row.areaId,
      policyVersion: String(risk.policyVersion),
      reason: "CHECKOUT_OMITIDO",
      metadata: { risk, cutoff: cutoff.toISOString() },
    },
    tx,
  );
  await operationalNotification(tx, userId, "ATTENDANCE_DAILY_CUTOFF", {
    attendanceId: row.id,
    requiresReview: true,
  });
  return true;
}
import { operationalNotification } from "../common/domain/operational-notification";
