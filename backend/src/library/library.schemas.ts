import { z } from "zod";

const cuid = z.string().regex(/^c[a-z0-9]{20,30}$/);
const fileId = z.string().regex(/^[a-f0-9]{30}$/);
const dateTime = z.string().datetime({ offset: true });

export const libraryCategories = [
  "MANUAL",
  "PROCEDIMIENTO",
  "REGLAMENTO",
  "FORMATO",
  "INSTRUCTIVO",
  "PROTOCOLO",
  "CAPACITACION",
  "PLANTILLA",
  "COMUNICADO_PERMANENTE",
  "POLITICA",
] as const;
export const libraryScopes = ["GLOBAL", "SEDE", "AREA", "PROYECTO"] as const;
export const libraryStates = [
  "BORRADOR",
  "EN_REVISION",
  "PUBLICADO",
  "ARCHIVADO",
] as const;

const versionFields = z
  .object({
    archivoId: fileId,
    resumenCambios: z.string().trim().min(1).max(2000),
    vigenteDesde: dateTime.optional(),
    vigenteHasta: dateTime.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.vigenteDesde &&
      value.vigenteHasta &&
      new Date(value.vigenteDesde) >= new Date(value.vigenteHasta)
    )
      ctx.addIssue({
        code: "custom",
        path: ["vigenteHasta"],
        message: "vigenteHasta must be after vigenteDesde",
      });
  });

export const createLibraryDocumentSchema = z
  .object({
    titulo: z.string().trim().min(1).max(191),
    descripcion: z.string().trim().max(2000).optional(),
    categoria: z.enum(libraryCategories),
    alcance: z.enum(libraryScopes),
    sedeId: z.number().int().positive().optional(),
    areaId: z.number().int().positive().optional(),
    proyectoId: cuid.optional(),
    requiereAcuse: z.boolean().optional().default(false),
    archivoId: fileId,
    resumenCambios: z.string().trim().min(1).max(2000),
    vigenteDesde: dateTime.optional(),
    vigenteHasta: dateTime.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const shapeIsValid =
      (value.alcance === "GLOBAL" &&
        !value.sedeId &&
        !value.areaId &&
        !value.proyectoId) ||
      (value.alcance === "SEDE" &&
        !!value.sedeId &&
        !value.areaId &&
        !value.proyectoId) ||
      (value.alcance === "AREA" &&
        !!value.sedeId &&
        !!value.areaId &&
        !value.proyectoId) ||
      (value.alcance === "PROYECTO" &&
        !value.sedeId &&
        !value.areaId &&
        !!value.proyectoId);
    if (!shapeIsValid)
      ctx.addIssue({
        code: "custom",
        path: ["alcance"],
        message: "Invalid scope dimensions",
      });
    if (
      value.vigenteDesde &&
      value.vigenteHasta &&
      new Date(value.vigenteDesde) >= new Date(value.vigenteHasta)
    )
      ctx.addIssue({
        code: "custom",
        path: ["vigenteHasta"],
        message: "vigenteHasta must be after vigenteDesde",
      });
  });

export const createLibraryVersionSchema = versionFields;

export const reviewLibraryVersionSchema = z
  .object({
    decision: z.enum(["APPROVE", "REQUEST_CHANGES"]),
    retroalimentacion: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === "REQUEST_CHANGES" && !value.retroalimentacion)
      ctx.addIssue({
        code: "custom",
        path: ["retroalimentacion"],
        message: "Feedback is required when requesting changes",
      });
  });

export const publishLibraryVersionSchema = z
  .object({ motivoSustitucion: z.string().trim().min(1).max(1000).optional() })
  .strict();

export const archiveLibraryDocumentSchema = z
  .object({ motivo: z.string().trim().min(1).max(1000) })
  .strict();

export const listLibrarySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().max(100).optional(),
    categoria: z.enum(libraryCategories).optional(),
    alcance: z.enum(libraryScopes).optional(),
    estado: z.enum(libraryStates).optional(),
    requiereAcuse: z.enum(["true", "false"]).optional(),
  })
  .strict();

export type CreateLibraryDocumentInput = z.infer<
  typeof createLibraryDocumentSchema
>;
export type CreateLibraryVersionInput = z.infer<
  typeof createLibraryVersionSchema
>;
export type ReviewLibraryVersionInput = z.infer<
  typeof reviewLibraryVersionSchema
>;
export type PublishLibraryVersionInput = z.infer<
  typeof publishLibraryVersionSchema
>;
export type ListLibraryInput = z.infer<typeof listLibrarySchema>;
