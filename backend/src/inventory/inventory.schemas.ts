import { z } from "zod";
import { visitIdSchema } from "../visits/visits.schemas";
export const quantitySchema = z
  .number()
  .finite()
  .min(-99999999.99)
  .max(99999999.99)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001,
    "At most two decimal places",
  );
const reason = z.string().trim().min(5).max(500);
export const inventoryQuerySchema = z.strictObject({
  cursor: visitIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  ubicacionId: z.coerce.number().int().positive().optional(),
});
export const locationCreateSchema = z.strictObject({
  sedeId: z.number().int().positive(),
  areaId: z.number().int().positive().optional(),
  nombre: z.string().trim().min(2).max(100),
  codigo: z.string().trim().min(2).max(50),
  reason,
});
export const itemCreateSchema = z
  .strictObject({
    codigo: z.string().trim().min(2).max(60),
    nombre: z.string().trim().min(2).max(150),
    descripcion: z.string().trim().max(1000).optional(),
    tipo: z.enum(["CONSUMIBLE", "ACTIVO"]),
    unidadMedida: z.string().trim().min(1).max(30).optional(),
    umbralMinimo: quantitySchema.refine((v) => v >= 0).optional(),
    ubicacionId: z.number().int().positive(),
    reason,
  })
  .superRefine((i, ctx) => {
    if (i.tipo === "CONSUMIBLE" && !i.unidadMedida)
      ctx.addIssue({ code: "custom", message: "Unit required" });
    if (i.tipo === "ACTIVO" && (i.unidadMedida || i.umbralMinimo !== undefined))
      ctx.addIssue({
        code: "custom",
        message: "Assets are individually identified",
      });
  });
export const movementSchema = z
  .strictObject({
    articuloId: visitIdSchema,
    version: z.number().int().positive(),
    tipo: z.enum(["ENTRADA", "SALIDA", "AJUSTE"]),
    cantidad: quantitySchema.refine((v) => v !== 0),
    motivo: reason,
  })
  .refine(
    (v) => v.tipo === "AJUSTE" || v.cantidad > 0,
    "Entry/exit quantities must be positive",
  );
export const loanSchema = z.strictObject({
  articuloId: visitIdSchema,
  version: z.number().int().positive(),
  solicitanteId: z.number().int().positive(),
  fechaLimite: z.iso.datetime(),
  motivo: reason,
});
export const returnSchema = z.strictObject({
  estadoFisico: z.enum(["DISPONIBLE", "EN_MANTENIMIENTO", "DANIADO", "BAJA"]),
  motivo: reason,
});
export const loansQuerySchema = z.strictObject({
  cursor: visitIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  estado: z.enum(["ACTIVO", "DEVUELTO"]).default("ACTIVO"),
  solicitanteId: z.coerce.number().int().positive().optional(),
  vencidos: z.enum(["true", "false"]).default("false"),
});
