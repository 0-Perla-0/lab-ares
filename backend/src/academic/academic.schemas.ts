import { z } from "zod";

const id = z.number().int().positive();
const name = z.string().trim().min(1).max(191);
export const profileSchema = z.object({
  institucionId: id,
  unidadAcademicaId: id.nullable().default(null),
  programaAcademicoId: id,
  cohorteId: id.nullable().default(null),
  inicio: z.string(),
  fin: z.string().nullable().default(null),
});
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => { const [y,m,d] = v.split("-").map(Number); const x = new Date(Date.UTC(y,m-1,d)); return x.getUTCFullYear() === y && x.getUTCMonth() === m-1 && x.getUTCDate() === d; }, "Invalid calendar date");
export const strictProfileSchema = profileSchema.extend({ inicio: dateOnly, fin: dateOnly.nullable().default(null) });
export const confirmSchema = z.object({ accept: z.boolean(), motivo: z.string().trim().max(500).optional() }).superRefine((v, ctx) => { if (!v.accept && !v.motivo) ctx.addIssue({ code: "custom", path: ["motivo"], message: "Required when rejecting" }); });
export const catalogSchema = z.object({ nombre: name, parentId: id.nullable().optional() });
export type ProfileInput = z.infer<typeof profileSchema>;
export type CatalogInput = z.infer<typeof catalogSchema>;
