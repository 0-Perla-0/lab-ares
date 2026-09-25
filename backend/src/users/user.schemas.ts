import { z } from "zod";

import { EstadoUsuario, RolUsuario } from "../generated/prisma/enums";

const CODIGO_MAX_LENGTH = 50; // Usuario.codigo @db.VarChar(50)
const EMAIL_MAX_LENGTH = 191; // Usuario.email @db.VarChar(191)
const PASSWORD_MIN_LENGTH = 15;
const PASSWORD_MAX_LENGTH = 128;

const codigo = z.string().trim().min(1).max(CODIGO_MAX_LENGTH);

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH)
  .pipe(z.email());

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)

const referenciaIdNullable = z.number().int().positive().nullable();

const estadoInicial = z.enum([
  EstadoUsuario.ACTIVA,
  EstadoUsuario.INVITADA,
]);

export const crearUsuarioSchema = z.object({
  codigo,
  email,
  password,
  rol: z.enum(RolUsuario).default(RolUsuario.PRESTADOR),
  estado: estadoInicial.default(EstadoUsuario.INVITADA),
  sedeId: referenciaIdNullable.default(null),
  areaId: referenciaIdNullable.default(null),
  turnoId: referenciaIdNullable.default(null),
});

export const actualizarUsuarioSchema = z
  .object({
    codigo,
    email,
    password,
    rol: z.enum(RolUsuario),
    estado: z.enum(EstadoUsuario),
    sedeId: referenciaIdNullable,
    areaId: referenciaIdNullable,
    turnoId: referenciaIdNullable,
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0);

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>;
