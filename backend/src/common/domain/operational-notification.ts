import type { Prisma } from "../../generated/prisma/client";
import { z } from "zod";
import {
  EstadoAsistencia,
  EstadoAusencia,
  EstadoTrabajoImpresion3D,
  EstadoSolicitudSupresion,
} from "../../generated/prisma/enums";

const attendance = z
  .object({
    attendanceId: z.number().int().positive(),
    status: z.enum(EstadoAsistencia),
  })
  .strict();
const absence = z
  .object({ ausenciaId: z.string().min(1), estado: z.enum(EstadoAusencia) })
  .strict();
const recovery = z
  .object({ sessionsRevoked: z.literal(true), mfaReset: z.boolean() })
  .strict();
export const notificationContracts = {
  PRINTING_3D_REVIEW_RESOLVED: z
    .object({
      jobId: z.string().min(1),
      estado: z.enum(EstadoTrabajoImpresion3D),
    })
    .strict(),
  PRINTING_3D_OPERATOR_ASSIGNED: z
    .object({ jobId: z.string().min(1) })
    .strict(),
  PRINTING_3D_EXECUTION_FINISHED: z
    .object({
      jobId: z.string().min(1),
      estado: z.enum(EstadoTrabajoImpresion3D),
    })
    .strict(),
  PRINTING_3D_JOB_REQUEUED: z.object({ jobId: z.string().min(1) }).strict(),
  SUPPRESSION_REQUEST_RESOLVED: z
    .object({
      requestId: z.string().min(1),
      estado: z.enum(EstadoSolicitudSupresion),
    })
    .strict(),
  ABSENCE_CALENDAR_CANCELLED: z
    .object({ ausenciaId: z.string().min(1), exceptionId: z.string().min(1) })
    .strict(),
  LIBRARY_PUBLISHED: z
    .object({
      documentId: z.string().min(1),
      versionId: z.string().min(1),
      requiresAcknowledgement: z.boolean(),
    })
    .strict(),
  ACADEMIC_PROFILE_REQUESTED: z
    .object({ requestId: z.number().int().positive() })
    .strict(),
  ACADEMIC_PROFILE_RESOLVED: z
    .object({ requestId: z.number().int().positive(), accept: z.boolean() })
    .strict(),
  SERVICE_PERIOD_CHANGED: z
    .object({
      periodId: z.string().min(1),
      estado: z.enum(["REGISTRADO", "INICIADO", "CERRADO", "CANCELADO"]),
      version: z.number().int().positive(),
    })
    .strict(),
  ATTENDANCE_CONTINGENCY_CREATED: attendance,
  ATTENDANCE_CORRECTED: attendance,
  ATTENDANCE_VALIDATED: attendance,
  ATTENDANCE_DAILY_CUTOFF: z
    .object({
      attendanceId: z.number().int().positive(),
      requiresReview: z.literal(true),
    })
    .strict(),
  ABSENCE_PROVISIONAL_CREATED: z
    .object({ ausenciaId: z.string().min(1), plazoLimiteAt: z.iso.datetime() })
    .strict(),
  ABSENCE_DEADLINE_EXPIRED: z
    .object({
      ausenciaId: z.string().min(1),
      apelacionLimiteAt: z.iso.datetime(),
    })
    .strict(),
  ABSENCE_JUSTIFICATION_SUBMITTED: absence,
  ABSENCE_RESOLVED: absence,
  ABSENCE_APPEAL_SUBMITTED: absence,
  ABSENCE_APPEAL_RESOLVED: absence,
  MFA_ENABLED: z.object({ enabled: z.literal(true) }).strict(),
  MFA_DISABLED: z.object({ enabled: z.literal(false) }).strict(),
  MFA_RECOVERY_CODES_REGENERATED: z
    .object({ regenerated: z.literal(true) })
    .strict(),
  MFA_RECOVERY_CODE_USED: z.object({ recovered: z.literal(true) }).strict(),
  MFA_ADMINISTRATIVE_RECOVERY: recovery,
  IDENTITY_ADMINISTRATIVE_RECOVERY: recovery,
  IDENTITY_TEMPORARILY_THROTTLED: z
    .object({ temporarilyBlocked: z.literal(true) })
    .strict(),
  EXPEDIENT_FORMALIZED: z
    .object({ formalizationId: z.string().min(1), inicio: z.iso.date() })
    .strict(),
} as const;
export type OperationalNotificationType = keyof typeof notificationContracts;

// The outbox stores only a reference, never narratives, file paths or tokens.
// Both records must commit with the business mutation. SMTP remains asynchronous.
export async function operationalNotification<
  K extends OperationalNotificationType,
>(
  tx: Prisma.TransactionClient,
  userId: number,
  type: K,
  payload: z.input<(typeof notificationContracts)[K]>,
) {
  // Fail the business transaction before persisting a malformed/private event.
  const safe = notificationContracts[type].parse(
    payload,
  ) as Prisma.InputJsonObject;
  const notification = await tx.notification.create({
    data: { userId, type, payload: safe },
  });
  await tx.outboxEvent.create({
    data: {
      type: "OPERATIONAL_NOTIFICATION",
      aggregateId: notification.id,
      payload: { notificationId: notification.id },
    },
  });
  return notification;
}

export function notificationLink(type: string): string {
  if (type === "SERVICE_PERIOD_CHANGED") return "/portal/expediente";
  if (type.startsWith("ACADEMIC_")) return "/portal/perfil-academico";
  if (type.startsWith("PRINTING_3D_")) return "/portal/impresion-3d";
  if (type.startsWith("SUPPRESSION_")) return "/portal/retencion";
  if (type === "LIBRARY_PUBLISHED") return "/portal/biblioteca";
  if (type === "EXPEDIENT_FORMALIZED") return "/portal/expediente";
  if (type.startsWith("ABSENCE_")) return "/portal/asistencia/ausencias";
  if (type.startsWith("ATTENDANCE_")) return "/portal/asistencia";
  if (type.startsWith("MFA_") || type.startsWith("IDENTITY_"))
    return "/portal/seguridad";
  return "/portal/notificaciones";
}
