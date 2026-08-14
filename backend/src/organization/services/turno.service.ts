import { Injectable } from "@nestjs/common";

import {
  conflict,
  invalidInput,
  notFound,
} from "../../common/errors/domain-error";
import { UniqueConstraintError } from "../../common/errors/unique-constraint-error";
import type { Turno, TurnoDia } from "../../generated/prisma/client";
import type {
  ActualizarTurnoInput,
  CrearTurnoInput,
} from "../organization.schemas";
import { AreaRepository } from "../repositories/area.repository";
import { TurnoRepository } from "../repositories/turno.repository";

const MINUTES_PER_HOUR = 60;
type TurnoWithDias = Turno & { dias: TurnoDia[] };

@Injectable()
export class TurnoService {
  constructor(
    private readonly turnos: TurnoRepository,
    private readonly areas: AreaRepository,
  ) {}

  async listar() {
    return (await this.turnos.findAllActivos()).map(toPublicTurno);
  }

  async obtener(id: number) {
    return toPublicTurno(await this.find(id));
  }

  async crear(input: CrearTurnoInput) {
    await this.ensureAreaUsable(input.areaId);
    const existing = await this.turnos.findByNombreEnArea(
      input.areaId,
      input.nombre,
    );
    if (existing?.activo) throw conflict("TURNO_ALREADY_EXISTS");

    const data = {
      nombre: input.nombre,
      areaId: input.areaId,
      horaInicio: toDate(input.horaInicio),
      horaFin: toDate(input.horaFin),
      dias: input.dias,
    };

    if (existing) {
      return toPublicTurno(
        await this.withUniqueName(() =>
          this.turnos.reactivate(existing.id, data),
        ),
      );
    }

    return toPublicTurno(
      await this.withUniqueName(() => this.turnos.create(data)),
    );
  }

  async actualizar(id: number, input: ActualizarTurnoInput) {
    const turno = await this.find(id);
    const areaId = input.areaId ?? turno.areaId;
    const nombre = input.nombre ?? turno.nombre;

    await this.ensureAreaUsable(areaId);
    const duplicate = await this.turnos.findByNombreEnArea(areaId, nombre, id);
    if (duplicate) throw conflict("TURNO_ALREADY_EXISTS");
    ensureSchedule(turno, input);

    const updated = await this.withUniqueName(() =>
      this.turnos.update(id, {
        ...(input.nombre === undefined ? {} : { nombre: input.nombre }),
        ...(input.areaId === undefined ? {} : { areaId: input.areaId }),
        ...(input.horaInicio === undefined
          ? {}
          : { horaInicio: toDate(input.horaInicio) }),
        ...(input.horaFin === undefined
          ? {}
          : { horaFin: toDate(input.horaFin) }),
        ...(input.dias === undefined ? {} : { dias: input.dias }),
      }),
    );

    return toPublicTurno(updated);
  }

  async desactivar(id: number) {
    const turno = await this.find(id);
    if (!turno.activo) return toPublicTurno(turno);
    return toPublicTurno(await this.turnos.deactivate(id));
  }

  private async find(id: number) {
    const turno = await this.turnos.findById(id);
    if (!turno) throw notFound("TURNO_NOT_FOUND");
    return turno;
  }

  private async ensureAreaUsable(areaId: number) {
    const area = await this.areas.findById(areaId);
    if (!area) throw notFound("AREA_NOT_FOUND");
    if (!area.activa) throw conflict("AREA_INACTIVE");
  }

  private async withUniqueName<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw conflict("TURNO_ALREADY_EXISTS");
      }
      throw error;
    }
  }
}

function ensureSchedule(turno: Turno, input: ActualizarTurnoInput) {
  const start = input.horaInicio ?? toMinutes(turno.horaInicio);
  const end = input.horaFin ?? toMinutes(turno.horaFin);
  if (start >= end) throw invalidInput("TURNO_HORARIO_INVALIDO");
}

function toDate(minutes: number) {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes % MINUTES_PER_HOUR));
}

function toMinutes(date: Date) {
  return date.getUTCHours() * MINUTES_PER_HOUR + date.getUTCMinutes();
}

function toTime(date: Date) {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function toPublicTurno(turno: TurnoWithDias) {
  return {
    id: turno.id,
    nombre: turno.nombre,
    horaInicio: toTime(turno.horaInicio),
    horaFin: toTime(turno.horaFin),
    activo: turno.activo,
    areaId: turno.areaId,
    dias: turno.dias.map(({ dia }) => dia),
    createdAt: turno.createdAt,
    updatedAt: turno.updatedAt,
  };
}
