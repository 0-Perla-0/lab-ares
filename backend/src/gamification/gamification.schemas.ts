import { z } from "zod";

const reason = z.string().trim().min(1).max(1000);
const code = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[A-Z0-9_]+$/);

export const gamificationPageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const gamificationRuleSchema = z
  .object({
    codigo: code,
    origen: z.literal("KAIROS_TERMINADA"),
    puntos: z.number().int().min(1).max(10000),
    motivo: reason,
  })
  .strict();

export const gamificationBadgeSchema = z
  .object({
    codigo: code,
    nombre: z.string().trim().min(1).max(120),
    descripcion: z.string().trim().min(1).max(500),
    umbralPuntos: z.number().int().min(1).max(1000000),
    motivo: reason,
  })
  .strict();

export const manualRecognitionSchema = z
  .object({
    usuarioId: z.number().int().positive(),
    puntos: z.number().int().min(1).max(10000),
    motivo: reason,
  })
  .strict();

export const reverseGamificationEventSchema = z
  .object({ motivo: reason })
  .strict();
export const gamificationIdempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export type GamificationPageInput = z.infer<typeof gamificationPageSchema>;
export type GamificationRuleInput = z.infer<typeof gamificationRuleSchema>;
export type GamificationBadgeInput = z.infer<typeof gamificationBadgeSchema>;
export type ManualRecognitionInput = z.infer<typeof manualRecognitionSchema>;
