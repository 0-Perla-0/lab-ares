import { z } from "zod";
export const visitIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,30}$/);
export const visitCodeSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const visitCreateSchema = z.strictObject({
  sedeId: z.number().int().positive(),
  areaId: z.number().int().positive().optional(),
  nombreVisitante: z.string().trim().min(2).max(150),
  institucionProcedencia: z.string().trim().min(2).max(150).optional(),
  motivo: z.string().trim().min(5).max(500),
  fechaProgramada: z.iso.date(),
  validaDesde: z.iso.datetime(),
  validaHasta: z.iso.datetime(),
});
export const visitQuerySchema = z.strictObject({
  cursor: visitIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  mine: z.enum(["true", "false"]).default("true"),
  estado: z
    .enum([
      "EMITIDA",
      "REGISTRADA_ENTRADA",
      "REGISTRADA_SALIDA",
      "VENCIDA",
      "CANCELADA",
    ])
    .optional(),
});
export const visitActionSchema = z.strictObject({
  version: z.number().int().positive(),
  observaciones: z.string().trim().max(1000).optional(),
});
export const visitEntrySchema = visitActionSchema.extend({
  identificacionVerificada: z.literal(true),
});
export const visitCancelSchema = visitActionSchema.extend({
  reason: z.string().trim().min(5).max(500),
});
