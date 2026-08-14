import { Injectable } from "@nestjs/common";

import { conflict, notFound } from "../../common/errors/domain-error";
import { UniqueConstraintError } from "../../common/errors/unique-constraint-error";
import type {
  ActualizarAreaInput,
  CrearAreaInput,
} from "../organization.schemas";
import { AreaRepository } from "../repositories/area.repository";
import { SedeRepository } from "../repositories/sede.repository";

@Injectable()
export class AreaService {
  constructor(
    private readonly areas: AreaRepository,
    private readonly sedes: SedeRepository,
  ) {}

  listar() {
    return this.areas.findAllActivas();
  }

  async obtener(id: number) {
    const area = await this.areas.findById(id);
    if (!area) throw notFound("AREA_NOT_FOUND");
    return area;
  }

  async crear(input: CrearAreaInput) {
    await this.ensureSedeUsable(input.sedeId);
    const existing = await this.areas.findByNombreEnSede(
      input.sedeId,
      input.nombre,
    );

    if (existing?.activa) throw conflict("AREA_ALREADY_EXISTS");

    const data = { nombre: input.nombre, sedeId: input.sedeId };
    if (existing) {
      return this.withUniqueName(() =>
        this.areas.reactivate(existing.id, data),
      );
    }
    return this.withUniqueName(() => this.areas.create(data));
  }

  async actualizar(id: number, input: ActualizarAreaInput) {
    const area = await this.obtener(id);
    const sedeId = input.sedeId ?? area.sedeId;
    const nombre = input.nombre ?? area.nombre;

    await this.ensureSedeUsable(sedeId);
    const existing = await this.areas.findByNombreEnSede(sedeId, nombre, id);
    if (existing) throw conflict("AREA_ALREADY_EXISTS");

    return this.withUniqueName(() => this.areas.update(id, input));
  }

  async desactivar(id: number) {
    const area = await this.obtener(id);
    if (!area.activa) return area;
    return this.areas.deactivateCascade(id);
  }

  private async ensureSedeUsable(sedeId: number) {
    const sede = await this.sedes.findById(sedeId);
    if (!sede) throw notFound("SEDE_NOT_FOUND");
    if (!sede.activa) throw conflict("SEDE_INACTIVE");
  }

  private async withUniqueName<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw conflict("AREA_ALREADY_EXISTS");
      }
      throw error;
    }
  }
}
