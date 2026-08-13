import type {
  ActualizarSedeInput,
  CrearSedeInput,
} from "../../../schemas/organization";
import { conflict, notFound } from "../../errors/domain-error";
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

  return sedeRepository.create({
    nombre: input.nombre,
    direccion: input.direccion ?? null,
  });
}

export async function actualizarSede(id: number, input: ActualizarSedeInput) {
  await obtenerSede(id);

  if (input.nombre !== undefined) {
    await verificarNombreDisponible(input.nombre, id);
  }

  return sedeRepository.update(id, input);
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
