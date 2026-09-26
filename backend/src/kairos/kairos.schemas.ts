import { z } from "zod";

export const projectSchema = z.object({ nombre: z.string().trim().min(1).max(191), descripcion: z.string().trim().max(1000).nullable().optional(), prioridad: z.enum(["BAJA", "MEDIA", "ALTA", "CRITICA"]).optional() }).strict();
export const projectUpdateSchema = projectSchema.partial().extend({ estado: z.enum(["BORRADOR", "ACTIVO", "ARCHIVADO"]).optional() }).strict().refine(value => Object.keys(value).length > 0, { message: "At least one field is required" });
export const memberSchema = z.object({ usuarioId: z.number().int().positive(), rol: z.enum(["SUBLIDER", "COLABORADOR", "OBSERVADOR"]) }).strict();
export const memberRoleSchema = z.object({ rol: z.enum(["SUBLIDER", "COLABORADOR", "OBSERVADOR"]) }).strict();
export const favoriteSchema = z.object({ enabled: z.boolean() }).strict();
export type ProjectInput = z.infer<typeof projectSchema>;
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;
