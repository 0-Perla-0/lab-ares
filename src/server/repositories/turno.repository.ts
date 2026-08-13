import type { DiaSemana } from "../../generated/prisma/enums";
import type { TurnoCreateInput } from "../../generated/prisma/models";
import { getPrisma } from "../db/prisma";

import { translateUniqueViolation } from "./prisma-errors";

type Datos = Pick<TurnoCreateInput, "nombre" | "horaInicio" | "horaFin"> & {
  areaId: number;
  dias: DiaSemana[];
};

type UpdateData = Partial<Datos>;

/** El enum DiaSemana ya ordena de LUNES a DOMINGO, así que asc es la semana. */
const conDias = { dias: { orderBy: { dia: "asc" } } } satisfies {
  dias: { orderBy: { dia: "asc" } };
};

export function findAllActivos() {
  return getPrisma().turno.findMany({
    where: { activo: true },
    orderBy: [{ areaId: "asc" }, { nombre: "asc" }],
    include: conDias,
  });
}

export function findById(id: number) {
  return getPrisma().turno.findUnique({
    where: { id },
    include: conDias,
  });
}

/**
 * El nombre solo es único dentro de su área. La colación utf8mb4_unicode_ci
 * hace la comparación case-insensitive.
 */
export function findByNombreEnArea(
  areaId: number,
  nombre: string,
  excludeId?: number,
) {
  return getPrisma().turno.findFirst({
    where: {
      areaId,
      nombre,
      id: excludeId === undefined ? undefined : { not: excludeId },
    },
  });
}

/** El turno y sus días nacen en la misma operación: no puede quedar sin días. */
export function create({ dias, ...turno }: Datos) {
  return translateUniqueViolation(() =>
    getPrisma().turno.create({
      data: { ...turno, dias: { create: dias.map((dia) => ({ dia })) } },
      include: conDias,
    }),
  );
}

/** Si llegan días, se reemplazan enteros dentro de la misma transacción. */
export function update(id: number, { dias, ...turno }: UpdateData) {
  return translateUniqueViolation(() =>
    getPrisma().$transaction(async (tx) => {
      if (dias !== undefined) {
        await reemplazarDias(tx, id, dias);
      }

      return tx.turno.update({
        where: { id },
        data: turno,
        include: conDias,
      });
    }),
  );
}

/** Revive un turno dado de baja con los datos nuevos, días incluidos. */
export function reactivate(id: number, { dias, ...turno }: Datos) {
  return translateUniqueViolation(() =>
    getPrisma().$transaction(async (tx) => {
      await reemplazarDias(tx, id, dias);

      return tx.turno.update({
        where: { id },
        data: { ...turno, activo: true },
        include: conDias,
      });
    }),
  );
}

export function deactivate(id: number) {
  return getPrisma().turno.update({
    where: { id },
    data: { activo: false },
    include: conDias,
  });
}

type TransactionClient = Parameters<
  Parameters<ReturnType<typeof getPrisma>["$transaction"]>[0]
>[0];

async function reemplazarDias(
  tx: TransactionClient,
  turnoId: number,
  dias: DiaSemana[],
) {
  await tx.turnoDia.deleteMany({ where: { turnoId } });
  await tx.turnoDia.createMany({
    data: dias.map((dia) => ({ turnoId, dia })),
  });
}
