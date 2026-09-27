import { z } from "zod";

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        !/(password|secret|token|credential|authorization|cookie)\s*[:=]/i.test(
          value,
        ),
      "Secrets are not allowed",
    );

function containsSensitiveKey(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null) return false;
  if (typeof value === "string")
    return /(password|secret|token|credential|authorization|cookie|bearer)\s*[:= ]/i.test(
      value,
    );
  if (typeof value !== "object") return false;
  if (Array.isArray(value))
    return value.some((item) => containsSensitiveKey(item, depth + 1));
  return Object.entries(value as Record<string, unknown>).some(
    ([key, item]) =>
      /(password|secret|token|credential|authorization|cookie|objectkey)/i.test(
        key,
      ) || containsSensitiveKey(item, depth + 1),
  );
}

const operationalData = z
  .record(z.string(), z.unknown())
  .refine((value) => !containsSensitiveKey(value), "Secrets are not allowed");

export const operationsListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  state: z.string().trim().max(40).optional(),
  name: z.string().trim().max(100).optional(),
});

export const createJobSchema = z.object({
  name: z.string().trim().min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(191),
  payload: operationalData.optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
});

export const claimJobSchema = z.object({
  owner: z.string().trim().min(3).max(100),
  leaseMs: z.number().int().min(10_000).max(3_600_000).optional(),
});

export const claimJobApiSchema = claimJobSchema.omit({ owner: true });

export const completeJobSchema = z.object({
  owner: z.string().trim().min(3).max(100),
  result: operationalData.optional(),
});

export const completeJobApiSchema = completeJobSchema.omit({ owner: true });

export const failJobSchema = z.object({
  owner: z.string().trim().min(3).max(100),
  errorCode: z.string().trim().min(1).max(100),
});

export const failJobApiSchema = failJobSchema.omit({ owner: true });

export const resolutionSchema = z.object({
  resolution: safeText(500),
});

const communicationSchema = z.object({
  at: z.coerce.date(),
  channel: z.string().trim().min(1).max(40),
  message: safeText(500),
});

export const createIncidentSchema = z.object({
  externalTicketRef: z.string().trim().min(3).max(191),
  severity: z.enum(["S1", "S2", "S3", "S4"]),
  ownerId: z.number().int().positive().optional(),
  reason: safeText(1000),
  communications: z.array(communicationSchema).max(100).optional(),
  repeatedS2: z.boolean().default(false),
});

export const updateIncidentSchema = z
  .object({
    state: z
      .enum([
        "ABIERTO",
        "RECONOCIDO",
        "INVESTIGANDO",
        "MITIGANDO",
        "MONITOREANDO",
        "RESUELTO",
        "CERRADO",
      ])
      .optional(),
    severity: z.enum(["S1", "S2", "S3", "S4"]).optional(),
    ownerId: z.number().int().positive().nullable().optional(),
    reason: safeText(1000).optional(),
    communications: z.array(communicationSchema).max(100).optional(),
  })
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0)
      context.addIssue({
        code: "custom",
        message: "At least one field is required",
      });
    if ((value.state || value.severity) && (!value.reason || !value.ownerId))
      context.addIssue({
        code: "custom",
        message: "State or severity changes require reason and ownerId",
      });
  });

export type OperationsList = z.infer<typeof operationsListSchema>;
export type CreateJob = z.infer<typeof createJobSchema>;
export type ClaimJob = z.infer<typeof claimJobSchema>;
export type CompleteJob = z.infer<typeof completeJobSchema>;
export type FailJob = z.infer<typeof failJobSchema>;
export type CreateIncident = z.infer<typeof createIncidentSchema>;
export type UpdateIncident = z.infer<typeof updateIncidentSchema>;
