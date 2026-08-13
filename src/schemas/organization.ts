import { z } from "zod";

import { DiaSemana } from "../generated/prisma/enums";

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

const AREA_NOMBRE_MAX_LENGTH = 150; // Area.nombre @db.VarChar(150)

const areaNombre = z.string().trim().min(1).max(AREA_NOMBRE_MAX_LENGTH);

const referenciaId = z.number().int().positive();

export const crearAreaSchema = z.object({
  nombre: areaNombre,
  sedeId: referenciaId,
});

export const actualizarAreaSchema = crearAreaSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0);

export type CrearAreaInput = z.infer<typeof crearAreaSchema>;
export type ActualizarAreaInput = z.infer<typeof actualizarAreaSchema>;

const TURNO_NOMBRE_MAX_LENGTH = 100; // Turno.nombre @db.VarChar(100)

const turnoNombre = z.string().trim().min(1).max(TURNO_NOMBRE_MAX_LENGTH);

/**
 * "HH:MM" en 24 horas, normalizado a minutos desde medianoche: así comparar
 * inicio y fin es una resta, y el Service solo tiene que convertir a la hora
 * que guarda Prisma.
 */
const horaDelDia = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .transform((hora) => {
    const [horas, minutos] = hora.split(":");

    return Number(horas) * 60 + Number(minutos);
  });

const diasDeLaSemana = z
  .array(z.enum(DiaSemana))
  .min(1)
  .refine((dias) => new Set(dias).size === dias.length);

const turnoBase = z.object({
  nombre: turnoNombre,
  areaId: referenciaId,
  horaInicio: horaDelDia,
  horaFin: horaDelDia,
  dias: diasDeLaSemana,
});

export const crearTurnoSchema = turnoBase.refine(
  ({ horaInicio, horaFin }) => horaInicio < horaFin,
);

/**
 * En un PUT parcial solo se pueden comparar las dos horas si llegan las dos;
 * si llega una sola, el Service la contrasta contra la que ya está guardada.
 */
export const actualizarTurnoSchema = turnoBase
  .partial()
  .refine((input) => Object.keys(input).length > 0)
  .refine(
    ({ horaInicio, horaFin }) =>
      horaInicio === undefined || horaFin === undefined || horaInicio < horaFin,
  );

export type CrearTurnoInput = z.infer<typeof crearTurnoSchema>;
export type ActualizarTurnoInput = z.infer<typeof actualizarTurnoSchema>;
