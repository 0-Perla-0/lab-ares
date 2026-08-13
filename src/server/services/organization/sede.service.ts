import type {
  ActualizarSedeInput,
  CrearSedeInput,
} from "../../../schemas/organization";
import { conflict, notFound } from "../../errors/domain-error";
import { UniqueConstraintError } from "../../errors/unique-constraint-error";
import * as sedeRepository from "../../repositories/sede.repository";

export function listarSedes() {
  return sedeRepository.findAllActivas();
}

/** Devuelve la sede aunque esté dada de baja: existe, solo está inactiva. */
export async function obtenerSede(id: number) {
  const sede = await sedeRepository.findById(id);

  if (!sede) {
    throw notFound("SEDE_NOT_FOUND");
  }

  return sede;
}

/**
 * Crear con el nombre de una sede dada de baja la revive con los datos nuevos,
 * en lugar de chocar contra un registro que el usuario ya no ve. Solo la sede:
 * sus áreas siguen inactivas hasta que se reactiven una a una.
 */
export async function crearSede(input: CrearSedeInput) {
  const datos = {
    nombre: input.nombre,
    direccion: input.direccion ?? null,
  };

  const existente = await sedeRepository.findByNombre(input.nombre);

  if (existente?.activa) {
    throw conflict("SEDE_ALREADY_EXISTS");
  }

  if (existente) {
    return conNombreUnico(() => sedeRepository.reactivate(existente.id, datos));
  }

  return conNombreUnico(() => sedeRepository.create(datos));
}

export async function actualizarSede(id: number, input: ActualizarSedeInput) {
  await obtenerSede(id);

  if (input.nombre !== undefined) {
    await verificarNombreDisponible(input.nombre, id);
  }

  return conNombreUnico(() => sedeRepository.update(id, input));
}

/**
 * Baja lógica idempotente que arrastra las áreas de la sede: desactivar una
 * sede ya inactiva no es un error y no vuelve a escribir.
 */
export async function desactivarSede(id: number) {
  const sede = await obtenerSede(id);

  if (!sede.activa) {
    return sede;
  }

  return sedeRepository.deactivateCascade(id);
}

async function verificarNombreDisponible(nombre: string, excludeId?: number) {
  const existente = await sedeRepository.findByNombre(nombre, excludeId);

  if (existente) {
    throw conflict("SEDE_ALREADY_EXISTS");
  }
}

/**
 * Red de seguridad para la carrera entre el chequeo de arriba y la escritura:
 * si el índice único salta primero, el conflicto sigue siendo un 409 y no un 500.
 */
async function conNombreUnico<T>(escritura: () => Promise<T>): Promise<T> {
  try {
    return await escritura();
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw conflict("SEDE_ALREADY_EXISTS");
    }

    throw error;
  }
}
