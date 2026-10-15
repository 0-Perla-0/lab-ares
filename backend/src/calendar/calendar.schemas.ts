import { z } from "zod";

export const civilDate = z.iso.date();
export const resourceId = z.string().regex(/^c[a-z0-9]{20,29}$/);
const positiveId = z.number().int().positive();
export const exceptionSchema = z
  .strictObject({
    titulo: z.string().trim().min(3).max(150),
    motivo: z.string().trim().min(5).max(500),
    tipo: z.enum([
      "FESTIVO_OFICIAL",
      "VACACIONES_INSTITUCIONALES",
      "SUSPENSION_OPERATIVA",
      "PERMISO_INDIVIDUAL",
      "HORARIO_ESPECIAL",
      "ASISTENCIA_EXTRAORDINARIA",
    ]),
    efecto: z.enum([
      "SUSPENSION_ACTIVIDADES",
      "HORARIO_ESPECIAL",
      "ASISTENCIA_EXTRAORDINARIA",
      "PERMISO_PROGRAMADO",
    ]),
    alcance: z.enum(["GLOBAL", "SEDE", "AREA", "USUARIO"]),
    sedeId: positiveId.optional(),
    areaId: positiveId.optional(),
    usuarioId: positiveId.optional(),
    fechaInicio: civilDate,
    fechaFin: civilDate,
    horaInicio: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d:00$/)
      .optional(),
    horaFin: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d:00$/)
      .optional(),
    // No equivalent hours are credited by an exception: attendance still requires validation.
  })
  .superRefine((v, ctx) => {
    if (
      v.fechaFin < v.fechaInicio ||
      (Date.parse(v.fechaFin) - Date.parse(v.fechaInicio)) / 86400000 > 366
    )
      ctx.addIssue({
        code: "custom",
        message: "Date range must be ordered and at most 367 days",
      });
    const shape = [
      v.sedeId !== undefined,
      v.areaId !== undefined,
      v.usuarioId !== undefined,
    ].join();
    const shapes = {
      GLOBAL: "false,false,false",
      SEDE: "true,false,false",
      AREA: "false,true,false",
      USUARIO: "false,false,true",
    };
    if (shape !== shapes[v.alcance])
      ctx.addIssue({
        code: "custom",
        message: "Scope requires exactly its target",
      });
    if (
      v.efecto === "HORARIO_ESPECIAL"
        ? !v.horaInicio || !v.horaFin || v.horaInicio >= v.horaFin
        : v.horaInicio !== undefined || v.horaFin !== undefined
    )
      ctx.addIssue({
        code: "custom",
        message: "Special hours require an ordered same-day interval",
      });
  });
export type ExceptionInput = z.infer<typeof exceptionSchema>;
export const createExceptionSchema = z.strictObject({
  exception: exceptionSchema,
  previewId: resourceId.optional(),
  confirmDefinitive: z.boolean().default(false),
});
export const revokeExceptionSchema = z.strictObject({
  motivo: z.string().trim().min(5).max(500),
  previewId: resourceId.optional(),
  confirmDefinitive: z.boolean().default(false),
});
export const calendarQuerySchema = z
  .strictObject({
    from: civilDate,
    to: civilDate,
  })
  .refine(
    (v) =>
      v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
    "Invalid date range",
  );
