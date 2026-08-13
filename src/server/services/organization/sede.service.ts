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

export async function crearSede(input: CrearSedeInput) {
  await verificarNombreDisponible(input.nombre);

  return conNombreUnico(() =>
    sedeRepository.create({
      nombre: input.nombre,
      direccion: input.direccion ?? null,
    }),
  );
}

export async function actualizarSede(id: number, input: ActualizarSedeInput) {
  await obtenerSede(id);

  if (input.nombre !== undefined) {
    await verificarNombreDisponible(input.nombre, id);
  }

  return conNombreUnico(() => sedeRepository.update(id, input));
}

/** Baja lógica idempotente: desactivar una sede ya inactiva no es un error. */
export async function desactivarSede(id: number) {
  const sede = await obtenerSede(id);

  if (!sede.activa) {
    return sede;
  }

  return sedeRepository.deactivate(id);
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
