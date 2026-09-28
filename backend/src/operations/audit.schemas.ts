import { z } from "zod";

const optionalPositiveInt = z.coerce.number().int().positive().optional();

export const auditQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    actorId: optionalPositiveInt,
    subjectId: optionalPositiveInt,
    module: z.string().trim().min(1).max(60).optional(),
    action: z.string().trim().min(1).max(100).optional(),
    objectType: z.string().trim().min(1).max(100).optional(),
    objectId: z.string().trim().min(1).max(100).optional(),
    result: z.enum(["SUCCESS", "DENIED", "FAILED"]).optional(),
    sedeId: optionalPositiveInt,
    areaId: optionalPositiveInt,
    correlationId: z.string().trim().min(8).max(100).optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: "from must be before or equal to to",
    path: ["to"],
  });

export const auditPeriodSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;
