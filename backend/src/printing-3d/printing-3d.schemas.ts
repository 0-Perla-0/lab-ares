import { z } from "zod";

const reason = z.string().trim().min(1).max(1000);

export const printing3dIdSchema = z.string().regex(/^c[a-z0-9]{20,30}$/);

export const printing3dIdempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const printing3dJobCreateSchema = z
  .object({
    archivoId: printing3dIdSchema,
    descripcion: z.string().trim().min(1).max(2000),
  })
  .strict();

export const printing3dJobListSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    estado: z
      .enum([
        "SOLICITADO",
        "EN_REVISION",
        "APROBADO",
        "EN_COLA",
        "EN_IMPRESION",
        "COMPLETADO",
        "RECHAZADO",
        "CANCELADO",
        "FALLIDO",
      ])
      .optional(),
  })
  .strict();

export const printing3dReviewSchema = z
  .object({
    decision: z.enum(["START", "APPROVE", "REJECT"]),
    motivo: reason.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === "REJECT" && !value.motivo)
      context.addIssue({
        code: "custom",
        path: ["motivo"],
        message: "Required when rejecting a job",
      });
  });

export const printing3dAssignSchema = z
  .object({ operadorId: z.number().int().positive() })
  .strict();

export const printing3dExecutionStartSchema = z
  .object({ material: z.string().trim().min(1).max(120) })
  .strict();

export const printing3dExecutionFinishSchema = z
  .object({
    resultado: z.enum(["COMPLETADA", "FALLIDA"]),
    pesoGramos: z.number().int().positive().max(100000).optional(),
    observacion: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.resultado === "FALLIDA" && !value.observacion)
      context.addIssue({
        code: "custom",
        path: ["observacion"],
        message: "Required when an execution fails",
      });
  });

export const printing3dReasonSchema = z.object({ motivo: reason }).strict();

export type Printing3dJobCreateInput = z.infer<
  typeof printing3dJobCreateSchema
>;
export type Printing3dJobListInput = z.infer<typeof printing3dJobListSchema>;
export type Printing3dReviewInput = z.infer<typeof printing3dReviewSchema>;
export type Printing3dAssignInput = z.infer<typeof printing3dAssignSchema>;
export type Printing3dExecutionStartInput = z.infer<
  typeof printing3dExecutionStartSchema
>;
export type Printing3dExecutionFinishInput = z.infer<
  typeof printing3dExecutionFinishSchema
>;
