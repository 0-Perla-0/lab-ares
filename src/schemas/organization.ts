import { z } from "zod";

// Longitudes tomadas de prisma/schema.prisma
const SEDE_NOMBRE_MAX_LENGTH = 150; // Sede.nombre @db.VarChar(150)
const SEDE_DIRECCION_MAX_LENGTH = 255; // Sede.direccion @db.VarChar(255)

/** `:id` de ruta: solo enteros positivos, ya convertidos a number. */
export const idParamSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);

const sedeNombre = z.string().trim().min(1).max(SEDE_NOMBRE_MAX_LENGTH);

const sedeDireccion = z
  .string()
  .trim()
  .max(SEDE_DIRECCION_MAX_LENGTH)
  .nullable()
  .transform((direccion) => (direccion === "" ? null : direccion));

export const crearSedeSchema = z.object({
  nombre: sedeNombre,
  direccion: sedeDireccion.optional(),
});

export const actualizarSedeSchema = crearSedeSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0);

export type CrearSedeInput = z.infer<typeof crearSedeSchema>;
export type ActualizarSedeInput = z.infer<typeof actualizarSedeSchema>;
