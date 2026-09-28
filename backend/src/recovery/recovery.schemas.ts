import { z } from "zod";

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        !/(password|secret|token|credential|authorization|cookie|objectkey)\s*[:=]/i.test(
          value,
        ),
      "Secrets and storage keys are not allowed",
    );

export const recoveryIdempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const recoveryListSchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  state: z
    .enum([
      "PLANNED",
      "FROZEN",
      "RESTORE_RECORDED",
      "RECONCILIATION_PREVIEWED",
      "RECONCILED",
      "AUDIT_VERIFIED",
      "JOURNAL_IMPORTED",
      "SUPPRESSIONS_REAPPLIED",
      "READY_APPROVED",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
    ])
    .optional(),
  scope: z.enum(["IMPORTANTE", "SECUNDARIO"]).optional(),
});

export const createRecoveryRunSchema = z.strictObject({
  name: safeText(191),
  scope: z.enum(["IMPORTANTE", "SECUNDARIO"]),
  responsibleId: z.number().int().positive(),
  isDrill: z.boolean().default(false),
});

export const freezeRecoverySchema = z.strictObject({
  reasonCode: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .regex(/^[A-Z0-9_:-]+$/),
});

export const recordRestoreSchema = z.strictObject({
  restorePoint: z.coerce.date(),
  imageVersion: safeText(191),
  externalProviderRef: safeText(191).optional(),
  actualRpoMinutes: z.number().int().min(0).max(525600).optional(),
  actualRtoMinutes: z.number().int().min(0).max(525600).optional(),
});

export const reconciliationSchema = z.strictObject({
  limit: z.number().int().min(1).max(1000).default(100),
});

export const periodSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const auditVerifySchema = z.strictObject({
  period: periodSchema,
});

export const journalPayloadSchema = z.strictObject({
  category: z.string().trim().min(1).max(60),
  resourceType: z.string().trim().min(1).max(100),
  resourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  action: z.enum(["ELIMINAR", "ANONIMIZAR"]),
  policyVersion: z.number().int().positive(),
  occurredAt: z.string().datetime(),
});

export const journalEnvelopeSchema = z.strictObject({
  entryId: z.string().trim().min(1).max(64),
  sequence: z.number().int().positive(),
  previousHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  entryHash: z.string().regex(/^[a-f0-9]{64}$/),
  occurredAt: z.string().datetime(),
  keyVersion: z.string().trim().min(1).max(50),
  payload: journalPayloadSchema,
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});

export const importJournalSchema = z.strictObject({
  entries: z.array(journalEnvelopeSchema).min(1).max(1000),
});

export const reapplySchema = z.strictObject({
  limit: z.number().int().min(1).max(1000).default(100),
});

export const reasonSchema = z.strictObject({ reason: safeText(500) });

export const completeRecoverySchema = z.strictObject({
  drillResult: z.enum(["PASSED", "PARTIAL", "FAILED"]).optional(),
  drillNotes: safeText(1000).optional(),
});

export const drillSchema = z.strictObject({
  result: z.enum(["PASSED", "PARTIAL", "FAILED"]),
  notes: safeText(1000),
});

export type RecoveryListInput = z.infer<typeof recoveryListSchema>;
export type CreateRecoveryRunInput = z.infer<typeof createRecoveryRunSchema>;
export type RecordRestoreInput = z.infer<typeof recordRestoreSchema>;
export type JournalEnvelopeInput = z.infer<typeof journalEnvelopeSchema>;
