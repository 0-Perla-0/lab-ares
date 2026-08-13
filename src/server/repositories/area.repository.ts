import type {
  AreaCreateInput,
  AreaUpdateInput,
} from "../../generated/prisma/models";
import { getPrisma } from "../db/prisma";

import { translateUniqueViolation } from "./prisma-errors";

type CreateData = Pick<AreaCreateInput, "nombre"> & { sedeId: number };
type UpdateData = Pick<AreaUpdateInput, "nombre"> & { sedeId?: number };

export function findAllActivas() {
  return getPrisma().area.findMany({
    where: { activa: true },
    orderBy: [{ sedeId: "asc" }, { nombre: "asc" }],
  });
}

export function findById(id: number) {
  return getPrisma().area.findUnique({ where: { id } });
}

/**
 * El nombre solo es único dentro de su sede: "Desarrollo" puede existir en
 * varias sedes a la vez. La colación utf8mb4_unicode_ci hace la comparación
 * case-insensitive.
 */
export function findByNombreEnSede(
  sedeId: number,
  nombre: string,
  excludeId?: number,
) {
  return getPrisma().area.findFirst({
    where: {
      sedeId,
      nombre,
      id: excludeId === undefined ? undefined : { not: excludeId },
    },
  });
}

export function create(data: CreateData) {
  return translateUniqueViolation(() => getPrisma().area.create({ data }));
}

export function update(id: number, data: UpdateData) {
  return translateUniqueViolation(() =>
    getPrisma().area.update({ where: { id }, data }),
  );
}

/** Vuelve a dar de alta un área dada de baja, con los datos recibidos. */
export function reactivate(id: number, data: CreateData) {
  return translateUniqueViolation(() =>
    getPrisma().area.update({
      where: { id },
      data: { ...data, activa: true },
    }),
  );
}

/** Baja lógica en cascada: el área y sus turnos caen juntos o no cae ninguno. */
export function deactivateCascade(id: number) {
  return getPrisma().$transaction(async (tx) => {
    await tx.turno.updateMany({
      where: { areaId: id },
      data: { activo: false },
    });

    return tx.area.update({ where: { id }, data: { activa: false } });
  });
}
