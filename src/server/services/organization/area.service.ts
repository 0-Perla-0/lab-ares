import type {
  ActualizarAreaInput,
  CrearAreaInput,
} from "../../../schemas/organization";
import { conflict, notFound } from "../../errors/domain-error";
import { UniqueConstraintError } from "../../errors/unique-constraint-error";
import * as areaRepository from "../../repositories/area.repository";
import * as sedeRepository from "../../repositories/sede.repository";

export function listarAreas() {
  return areaRepository.findAllActivas();
}

/** Devuelve el área aunque esté dada de baja: existe, solo está inactiva. */
export async function obtenerArea(id: number) {
  const area = await areaRepository.findById(id);

  if (!area) {
    throw notFound("AREA_NOT_FOUND");
  }

  return area;
}

/**
 * Crear con el nombre de un área dada de baja dentro de la misma sede la
 * revive, en lugar de chocar contra un registro que el usuario ya no ve.
 */
export async function crearArea(input: CrearAreaInput) {
  await verificarSedeUtilizable(input.sedeId);

  const existente = await areaRepository.findByNombreEnSede(
    input.sedeId,
    input.nombre,
  );

  if (existente?.activa) {
    throw conflict("AREA_ALREADY_EXISTS");
  }

  const datos = { nombre: input.nombre, sedeId: input.sedeId };

  if (existente) {
    return conNombreUnico(() => areaRepository.reactivate(existente.id, datos));
  }

  return conNombreUnico(() => areaRepository.create(datos));
}

export async function actualizarArea(id: number, input: ActualizarAreaInput) {
  const area = await obtenerArea(id);

  const sedeId = input.sedeId ?? area.sedeId;
  const nombre = input.nombre ?? area.nombre;

  await verificarSedeUtilizable(sedeId);

  const existente = await areaRepository.findByNombreEnSede(sedeId, nombre, id);

  if (existente) {
    throw conflict("AREA_ALREADY_EXISTS");
  }

  return conNombreUnico(() => areaRepository.update(id, input));
}

/** Baja lógica idempotente: desactivar un área ya inactiva no es un error. */
export async function desactivarArea(id: number) {
  const area = await obtenerArea(id);

  if (!area.activa) {
    return area;
  }

  return areaRepository.deactivateCascade(id);
}

/** Un área solo puede colgar de una sede que exista y siga de alta. */
async function verificarSedeUtilizable(sedeId: number) {
  const sede = await sedeRepository.findById(sedeId);

  if (!sede) {
    throw notFound("SEDE_NOT_FOUND");
  }

  if (!sede.activa) {
    throw conflict("SEDE_INACTIVE");
  }
}

/**
 * Red de seguridad para la carrera entre el chequeo de duplicados y la
 * escritura: si el índice único (sedeId, nombre) salta primero, sigue siendo
 * un 409 y no un 500.
 */
async function conNombreUnico<T>(escritura: () => Promise<T>): Promise<T> {
  try {
    return await escritura();
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw conflict("AREA_ALREADY_EXISTS");
    }

    throw error;
  }
}
