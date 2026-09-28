import { z } from "zod";
export const scopeSchema = z.enum(["area", "project", "all"]);
export const querySchema = z.object({ scope: scopeSchema, projectId: z.string().cuid().optional(), q: z.string().trim().max(80).optional(), page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).superRefine((v,ctx)=>{ if(v.scope === "project" && !v.projectId) ctx.addIssue({code:"custom",path:["projectId"],message:"projectId required"}); if(v.scope !== "project" && v.projectId) ctx.addIssue({code:"custom",path:["projectId"],message:"projectId only for project scope"}); });
export const preferenceSchema = z.object({ visibleEnArea: z.boolean().optional(), visibleEnProyectos: z.boolean().optional(), mostrarEmail: z.boolean().optional() }).strict().refine(v=>Object.keys(v).length>0,{message:"At least one preference is required"});
export type DirectoryQuery = z.infer<typeof querySchema>;
