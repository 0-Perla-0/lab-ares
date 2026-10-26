import { Injectable } from "@nestjs/common";

import type { AuthUser } from "../../auth/auth-user";
import { DomainTransaction } from "../../common/domain/domain-transaction";

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
    private readonly domain: DomainTransaction,
  ) {}

  listar() {
    return this.areas.findAllActivas();
  }

  async obtener(id: number) {
    const area = await this.areas.findById(id);
    if (!area) throw notFound("AREA_NOT_FOUND");
    return area;
  }

  crear(actor: AuthUser, key: string, input: CrearAreaInput) {
    return this.domain.run(
      actor,
      key,
      { op: "organization:area:create", input },
      async (tx) => {
        await this.ensureSedeUsable(input.sedeId);
        const existing = await this.areas.findByNombreEnSede(
          input.sedeId,
          input.nombre,
        );

        if (existing?.activa) throw conflict("AREA_ALREADY_EXISTS");

        const data = { nombre: input.nombre, sedeId: input.sedeId };
        if (existing) {
          return this.withUniqueName(() =>
            this.areas.reactivate(existing.id, data, tx),
          );
        }
        return this.withUniqueName(() => this.areas.create(data, tx));
      },
    );
  }

  actualizar(
    actor: AuthUser,
    key: string,
    id: number,
    input: ActualizarAreaInput,
  ) {
    return this.domain.run(
      actor,
      key,
      { op: "organization:area:update", id, input },
      async (tx) => {
        const area = await this.obtener(id);
        const sedeId = input.sedeId ?? area.sedeId;
        const nombre = input.nombre ?? area.nombre;

        await this.ensureSedeUsable(sedeId);
        const existing = await this.areas.findByNombreEnSede(
          sedeId,
          nombre,
          id,
        );
        if (existing) throw conflict("AREA_ALREADY_EXISTS");

        return this.withUniqueName(() => this.areas.update(id, input, tx));
      },
    );
  }

  desactivar(actor: AuthUser, key: string, id: number) {
    return this.domain.run(
      actor,
      key,
      { op: "organization:area:deactivate", id },
      async (tx) => {
        const area = await this.obtener(id);
        if (!area.activa) return area;
        return this.areas.deactivateCascade(id, tx);
      },
    );
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
