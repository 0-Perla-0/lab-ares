import { z } from "zod";

const ubicacionSchema = z
  .object({
    latitud: z.number().finite().min(-90).max(90),
    longitud: z.number().finite().min(-180).max(180),
    precisionMetros: z.number().finite().nonnegative().max(100_000),
  })
  .strict();

export const registrarAsistenciaSchema = z
  .object({
    ubicacion: ubicacionSchema.optional(),
  })
  .strict()
  .default({});

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export type RegistrarAsistenciaInput = z.infer<
  typeof registrarAsistenciaSchema
>;
