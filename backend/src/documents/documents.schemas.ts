import { z } from "zod";
export const requirementSchema = z.object({ usuarioId: z.number().int().positive(), codigo: z.string().trim().min(1).max(80), nombre: z.string().trim().min(1).max(191), obligatorio: z.boolean().optional().default(true) });
export const uploadSchema = z.object({ requisitoId: z.number().int().positive(), archivoId: z.string().min(1).max(30) });
export const reviewSchema = z.object({ estado: z.enum(["AUTORIZADO", "RECHAZADO", "REQUIERE_CORRECCION"]), comentario: z.string().trim().max(1000).optional() }).superRefine((v, c) => { if ((v.estado === "RECHAZADO" || v.estado === "REQUIERE_CORRECCION") && !v.comentario) c.addIssue({ code: "custom", path: ["comentario"], message: "Feedback required" }); });
export const listQuerySchema = z.object({ userId: z.coerce.number().int().positive().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) });
export type RequirementInput = z.infer<typeof requirementSchema>;
export type UploadInput = z.infer<typeof uploadSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
