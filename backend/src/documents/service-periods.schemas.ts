import { z } from "zod";
export const servicePeriodCreateSchema = z
  .object({
    formalizacionId: z.string().regex(/^c[a-z0-9]{20,30}$/),
    fin: z.iso.date(),
    motivo: z.string().trim().min(10).max(500),
  })
  .strict();
export const servicePeriodTransitionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    estado: z.enum(["INICIADO", "CERRADO", "CANCELADO"]),
    motivo: z.string().trim().min(10).max(500),
  })
  .strict();
export const servicePeriodListSchema = z
  .object({
    userId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type ServicePeriodCreate = z.infer<typeof servicePeriodCreateSchema>;
export type ServicePeriodTransition = z.infer<
  typeof servicePeriodTransitionSchema
>;
