import type {
  SedeCreateInput,
  SedeUpdateInput,
} from "../../generated/prisma/models";
import { getPrisma } from "../db/prisma";

import { translateUniqueViolation } from "./prisma-errors";

type CreateData = Pick<SedeCreateInput, "nombre" | "direccion">;
type UpdateData = Pick<SedeUpdateInput, "nombre" | "direccion">;

export function findAllActivas() {
  return getPrisma().sede.findMany({
    where: { activa: true },
    orderBy: { nombre: "asc" },
  });
}

export function findById(id: number) {
  return getPrisma().sede.findUnique({ where: { id } });
}

/**
 * La colación de la base (utf8mb4_unicode_ci) hace la comparación
 * case-insensitive, así que "Biblioteca" y "biblioteca" son el mismo nombre.
 */
export function findByNombre(nombre: string, excludeId?: number) {
  return getPrisma().sede.findFirst({
    where: {
      nombre,
      id: excludeId === undefined ? undefined : { not: excludeId },
    },
  });
}

export function create(data: CreateData) {
  return translateUniqueViolation(() => getPrisma().sede.create({ data }));
}

export function update(id: number, data: UpdateData) {
  return translateUniqueViolation(() =>
    getPrisma().sede.update({ where: { id }, data }),
  );
}

/** Vuelve a dar de alta una sede dada de baja, con los datos recibidos. */
export function reactivate(id: number, data: CreateData) {
  return translateUniqueViolation(() =>
    getPrisma().sede.update({
      where: { id },
      data: { ...data, activa: true },
    }),
  );
}

/**
 * Baja lógica en cascada: la sede y todas sus áreas caen juntas o no cae
 * ninguna. Los turnos de esas áreas todavía no entran (llegan en Turnos).
 */
export function deactivateWithAreas(id: number) {
  return getPrisma().$transaction(async (tx) => {
    await tx.area.updateMany({
      where: { sedeId: id },
      data: { activa: false },
    });

    return tx.sede.update({ where: { id }, data: { activa: false } });
  });
}
