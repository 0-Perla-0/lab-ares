import type {
  ActualizarTurnoInput,
  CrearTurnoInput,
} from "../../../schemas/organization";
import type { Turno, TurnoDia } from "../../../generated/prisma/client";
import { conflict, invalidInput, notFound } from "../../errors/domain-error";
import { UniqueConstraintError } from "../../errors/unique-constraint-error";
import * as areaRepository from "../../repositories/area.repository";
import * as turnoRepository from "../../repositories/turno.repository";

const MINUTOS_POR_HORA = 60;

type TurnoConDias = Turno & { dias: TurnoDia[] };

export async function listarTurnos() {
  const turnos = await turnoRepository.findAllActivos();

  return turnos.map(aTurno);
}

/** Devuelve el turno aunque esté dado de baja: existe, solo está inactivo. */
export async function obtenerTurno(id: number) {
  return aTurno(await buscarTurno(id));
}

/**
 * Crear con el nombre de un turno dado de baja dentro de la misma área lo
 * revive con el horario y los días nuevos.
 */
export async function crearTurno(input: CrearTurnoInput) {
  await verificarAreaUtilizable(input.areaId);

  const existente = await turnoRepository.findByNombreEnArea(
    input.areaId,
    input.nombre,
  );

  if (existente?.activo) {
    throw conflict("TURNO_ALREADY_EXISTS");
  }

  const datos = {
    nombre: input.nombre,
    areaId: input.areaId,
    horaInicio: aFecha(input.horaInicio),
    horaFin: aFecha(input.horaFin),
    dias: input.dias,
  };

  if (existente) {
    return aTurno(
      await conNombreUnico(() =>
        turnoRepository.reactivate(existente.id, datos),
      ),
    );
  }

  return aTurno(await conNombreUnico(() => turnoRepository.create(datos)));
}

export async function actualizarTurno(id: number, input: ActualizarTurnoInput) {
  const turno = await buscarTurno(id);

  const areaId = input.areaId ?? turno.areaId;
  const nombre = input.nombre ?? turno.nombre;

  await verificarAreaUtilizable(areaId);
  await verificarNombreDisponible(areaId, nombre, id);
  verificarHorario(turno, input);

  const actualizado = await conNombreUnico(() =>
    turnoRepository.update(id, {
      ...(input.nombre === undefined ? {} : { nombre: input.nombre }),
      ...(input.areaId === undefined ? {} : { areaId: input.areaId }),
      ...(input.horaInicio === undefined
        ? {}
        : { horaInicio: aFecha(input.horaInicio) }),
      ...(input.horaFin === undefined
        ? {}
        : { horaFin: aFecha(input.horaFin) }),
      ...(input.dias === undefined ? {} : { dias: input.dias }),
    }),
  );

  return aTurno(actualizado);
}

/** Baja lógica idempotente: desactivar un turno ya inactivo no es un error. */
export async function desactivarTurno(id: number) {
  const turno = await buscarTurno(id);

  if (!turno.activo) {
    return aTurno(turno);
  }

  return aTurno(await turnoRepository.deactivate(id));
}

async function buscarTurno(id: number) {
  const turno = await turnoRepository.findById(id);

  if (!turno) {
    throw notFound("TURNO_NOT_FOUND");
  }

  return turno;
}

/** Un turno solo puede colgar de un área que exista y siga de alta. */
async function verificarAreaUtilizable(areaId: number) {
  const area = await areaRepository.findById(areaId);

  if (!area) {
    throw notFound("AREA_NOT_FOUND");
  }

  if (!area.activa) {
    throw conflict("AREA_INACTIVE");
  }
}

async function verificarNombreDisponible(
  areaId: number,
  nombre: string,
  excludeId: number,
) {
  const existente = await turnoRepository.findByNombreEnArea(
    areaId,
    nombre,
    excludeId,
  );

  if (existente) {
    throw conflict("TURNO_ALREADY_EXISTS");
  }
}

/**
 * Zod ya comparó las horas cuando llegan las dos. Aquí se cubre el PUT que
 * manda una sola: se contrasta contra la que el turno ya tenía guardada.
 */
function verificarHorario(turno: Turno, input: ActualizarTurnoInput) {
  const inicio = input.horaInicio ?? aMinutos(turno.horaInicio);
  const fin = input.horaFin ?? aMinutos(turno.horaFin);

  if (inicio >= fin) {
    throw invalidInput("TURNO_HORARIO_INVALIDO");
  }
}

/**
 * El schema es TIME(0) y Prisma lo mueve como Date sobre la época en UTC:
 * escribir 08:00 UTC guarda 08:00 en MariaDB y se relee igual. Hay que usar
 * accesores UTC; los locales desplazarían la hora según la zona del servidor.
 */
function aFecha(minutos: number) {
  const horas = Math.floor(minutos / MINUTOS_POR_HORA);

  return new Date(Date.UTC(1970, 0, 1, horas, minutos % MINUTOS_POR_HORA));
}

function aMinutos(fecha: Date) {
  return fecha.getUTCHours() * MINUTOS_POR_HORA + fecha.getUTCMinutes();
}

function aHora(fecha: Date) {
  const horas = String(fecha.getUTCHours()).padStart(2, "0");
  const minutos = String(fecha.getUTCMinutes()).padStart(2, "0");

  return `${horas}:${minutos}`;
}

/** Forma pública del turno: horas como "HH:MM" y días como lista plana. */
function aTurno(turno: TurnoConDias) {
  return {
    id: turno.id,
    nombre: turno.nombre,
    horaInicio: aHora(turno.horaInicio),
    horaFin: aHora(turno.horaFin),
    activo: turno.activo,
    areaId: turno.areaId,
    dias: turno.dias.map(({ dia }) => dia),
    createdAt: turno.createdAt,
    updatedAt: turno.updatedAt,
  };
}

/**
 * Red de seguridad para la carrera entre el chequeo de duplicados y la
 * escritura: si el índice único (areaId, nombre) salta primero, sigue siendo
 * un 409 y no un 500.
 */
async function conNombreUnico<T>(escritura: () => Promise<T>): Promise<T> {
  try {
    return await escritura();
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw conflict("TURNO_ALREADY_EXISTS");
    }

    throw error;
  }
}
