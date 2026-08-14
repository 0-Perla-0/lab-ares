import { Injectable } from "@nestjs/common";

import { conflict, notFound } from "../../common/errors/domain-error";
import { UniqueConstraintError } from "../../common/errors/unique-constraint-error";
import type {
  ActualizarSedeInput,
  CrearSedeInput,
} from "../organization.schemas";
import { SedeRepository } from "../repositories/sede.repository";

@Injectable()
export class SedeService {
  constructor(private readonly sedes: SedeRepository) {}

  listar() {
    return this.sedes.findAllActivas();
  }

  async obtener(id: number) {
    const sede = await this.sedes.findById(id);
    if (!sede) throw notFound("SEDE_NOT_FOUND");
    return sede;
  }

  async crear(input: CrearSedeInput) {
    const data = {
      nombre: input.nombre,
      direccion: input.direccion ?? null,
    };
    const existing = await this.sedes.findByNombre(input.nombre);

    if (existing?.activa) throw conflict("SEDE_ALREADY_EXISTS");

    if (existing) {
      return this.withUniqueName(() =>
        this.sedes.reactivate(existing.id, data),
      );
    }

    return this.withUniqueName(() => this.sedes.create(data));
  }

  async actualizar(id: number, input: ActualizarSedeInput) {
    await this.obtener(id);

    if (input.nombre !== undefined) {
      const existing = await this.sedes.findByNombre(input.nombre, id);
      if (existing) throw conflict("SEDE_ALREADY_EXISTS");
    }

    return this.withUniqueName(() => this.sedes.update(id, input));
  }

  async desactivar(id: number) {
    const sede = await this.obtener(id);
    if (!sede.activa) return sede;
    return this.sedes.deactivateCascade(id);
  }

  private async withUniqueName<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw conflict("SEDE_ALREADY_EXISTS");
      }
      throw error;
    }
  }
}
