import { z } from "zod";
import { riskRulesSchema } from "./attendance-risk";
import { locationPolicySchema } from "./attendance-signals";
export const reviewQuerySchema = z.strictObject({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDIENTE", "AUTORIZADA", "RECHAZADA"]).default("PENDIENTE"),
  userId: z.coerce.number().int().positive().optional(),
  sedeId: z.coerce.number().int().positive().optional(),
  areaId: z.coerce.number().int().positive().optional(),
});
export const reviewReasonSchema = z.string().trim().min(5).max(500);
export const validationSchema = z.strictObject({
  version: z.number().int().positive(),
  decision: z.enum(["AUTORIZADA", "RECHAZADA"]),
  reason: reviewReasonSchema,
});
export const correctionSchema = z.strictObject({
  version: z.number().int().positive(),
  checkInAt: z.iso.datetime(),
  checkOutAt: z.iso.datetime(),
  reason: reviewReasonSchema,
});
export const batchValidationSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: z.number().int().positive(),
        version: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(100)
    .refine(
      (items) => new Set(items.map((i) => i.id)).size === items.length,
      "Duplicate attendance ids",
    ),
  reason: reviewReasonSchema,
});
export const attendancePolicySchema = z.strictObject({
  locationRules: locationPolicySchema.optional(),
  rules: riskRulesSchema,
  reason: reviewReasonSchema,
});
