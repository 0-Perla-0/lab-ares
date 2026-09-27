import { z } from "zod";
import {
  AccionFinalRetencion,
  CategoriaRetencion,
  EstadoLoteSupresion,
  EstadoRegistroRetencion,
  EstadoRetencionLegal,
  EstadoSolicitudSupresion,
} from "../generated/prisma/enums";

export const retentionIdSchema = z.string().regex(/^c[a-z0-9]{20,30}$/);

export const retentionIdempotencyKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);
const reason = z.string().trim().min(10).max(2000);

export const retentionRuleCreateSchema = z
  .object({
    categoria: z.nativeEnum(CategoriaRetencion),
    finalidad: z.string().trim().min(10).max(1000),
    responsable: z.string().trim().min(3).max(191),
    eventoInicio: z.string().trim().min(3).max(191),
    periodoActivoDias: z.number().int().min(0).max(36500),
    periodoBloqueadoDias: z.number().int().min(0).max(36500),
    accionFinal: z.nativeEnum(AccionFinalRetencion),
    fundamento: z.string().trim().min(10).max(2000),
    provisional: z.boolean().default(false),
    automatica: z.boolean().default(false),
  })
  .strict();

export const retentionRuleListSchema = z
  .object({
    categoria: z.nativeEnum(CategoriaRetencion).optional(),
    page,
    pageSize,
  })
  .strict();

export const retentionRuleApproveSchema = z
  .object({ referenciaAprobacion: z.string().trim().min(10).max(500) })
  .strict();

export const retentionRecordCreateSchema = z
  .object({
    categoria: z.nativeEnum(CategoriaRetencion),
    resourceType: z.string().trim().min(2).max(100),
    resourceId: z.string().trim().min(1).max(191),
    subjectId: z.number().int().positive().optional(),
    triggeredAt: z.coerce.date(),
  })
  .strict();

export const retentionRecordListSchema = z
  .object({
    categoria: z.nativeEnum(CategoriaRetencion).optional(),
    estado: z.nativeEnum(EstadoRegistroRetencion).optional(),
    subjectId: z.coerce.number().int().positive().optional(),
    page,
    pageSize,
  })
  .strict();

export const legalHoldCreateSchema = z
  .object({
    registroId: retentionIdSchema,
    motivo: reason,
    responsable: z.string().trim().min(3).max(191),
    reviewAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endsAt && value.endsAt < value.reviewAt)
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "endsAt must be on or after reviewAt",
      });
  });

export const legalHoldReleaseSchema = z.object({ motivo: reason }).strict();

export const legalHoldListSchema = z
  .object({
    estado: z.nativeEnum(EstadoRetencionLegal).optional(),
    registroId: retentionIdSchema.optional(),
    page,
    pageSize,
  })
  .strict();

export const suppressionRequestCreateSchema = z
  .object({ motivo: reason })
  .strict();

export const suppressionRequestListSchema = z
  .object({
    estado: z.nativeEnum(EstadoSolicitudSupresion).optional(),
    page,
    pageSize,
  })
  .strict();

export const suppressionRequestResolveSchema = z
  .object({
    decision: z.enum(["REVIEW", "APPROVE", "REJECT"]),
    resolucion: reason,
    clasificacion: z
      .array(z.nativeEnum(CategoriaRetencion))
      .max(13)
      .default([]),
  })
  .strict();

export const suppressionBatchCreateSchema = z
  .object({
    categoria: z.nativeEnum(CategoriaRetencion).optional(),
    cutoffAt: z.coerce.date(),
    limit: z.number().int().min(1).max(100).default(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.cutoffAt.getTime() > Date.now())
      context.addIssue({
        code: "custom",
        path: ["cutoffAt"],
        message: "cutoffAt cannot be in the future",
      });
  });

export const suppressionBatchListSchema = z
  .object({
    categoria: z.nativeEnum(CategoriaRetencion).optional(),
    estado: z.nativeEnum(EstadoLoteSupresion).optional(),
    page,
    pageSize,
  })
  .strict();

export const suppressionReasonSchema = z.object({ motivo: reason }).strict();

export const suppressionRegistryListSchema = z
  .object({
    categoria: z.nativeEnum(CategoriaRetencion).optional(),
    page,
    pageSize,
  })
  .strict();

export type RetentionRuleCreateInput = z.infer<
  typeof retentionRuleCreateSchema
>;
export type RetentionRuleListInput = z.infer<typeof retentionRuleListSchema>;
export type RetentionRecordCreateInput = z.infer<
  typeof retentionRecordCreateSchema
>;
export type RetentionRecordListInput = z.infer<
  typeof retentionRecordListSchema
>;
export type LegalHoldCreateInput = z.infer<typeof legalHoldCreateSchema>;
export type LegalHoldListInput = z.infer<typeof legalHoldListSchema>;
export type SuppressionRequestListInput = z.infer<
  typeof suppressionRequestListSchema
>;
export type SuppressionRequestResolveInput = z.infer<
  typeof suppressionRequestResolveSchema
>;
export type SuppressionBatchCreateInput = z.infer<
  typeof suppressionBatchCreateSchema
>;
export type SuppressionBatchListInput = z.infer<
  typeof suppressionBatchListSchema
>;
export type SuppressionRegistryListInput = z.infer<
  typeof suppressionRegistryListSchema
>;
