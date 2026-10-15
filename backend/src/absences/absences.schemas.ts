import { z } from "zod";
import { resourceId } from "../calendar/calendar.schemas";
const version = z.number().int().positive();
const evidence = z
  .string()
  .regex(/^[a-f0-9]{30}$/)
  .optional();
export const justificationSchema = z.strictObject({
  version,
  motivo: z.string().trim().min(5).max(2000),
  archivoId: evidence,
});
export const appealSchema = z.strictObject({
  version,
  argumento: z.string().trim().min(5).max(2000),
  archivoId: evidence,
});
export const resolutionSchema = z.strictObject({
  version,
  decision: z.enum(["JUSTIFICADA", "EN_ACLARACION", "NO_JUSTIFICADA"]),
  motivo: z.string().trim().min(5).max(1000),
});
export const appealResolutionSchema = z.strictObject({
  version,
  decision: z.enum(["JUSTIFICADA", "NO_JUSTIFICADA"]),
  motivo: z.string().trim().min(5).max(1000),
});
export const absenceQuerySchema = z.strictObject({
  cursor: resourceId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  estado: z
    .enum([
      "PENDIENTE_JUSTIFICACION",
      "JUSTIFICACION_ENVIADA",
      "EN_ACLARACION",
      "JUSTIFICADA",
      "NO_JUSTIFICADA",
      "EN_APELACION",
      "CANCELADA",
    ])
    .optional(),
});
