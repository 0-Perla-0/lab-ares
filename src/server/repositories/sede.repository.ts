import type {
  SedeCreateInput,
  SedeUpdateInput,
} from "../../generated/prisma/models";
import { getPrisma } from "../db/prisma";

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
  return getPrisma().sede.create({ data });
}

export function update(id: number, data: UpdateData) {
  return getPrisma().sede.update({ where: { id }, data });
}

export function deactivate(id: number) {
  return getPrisma().sede.update({ where: { id }, data: { activa: false } });
}
