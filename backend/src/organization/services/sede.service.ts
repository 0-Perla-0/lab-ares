import { Injectable } from "@nestjs/common";

import type { AuthUser } from "../../auth/auth-user";
import { DomainTransaction } from "../../common/domain/domain-transaction";

import { conflict, notFound } from "../../common/errors/domain-error";
import { UniqueConstraintError } from "../../common/errors/unique-constraint-error";
import type {
  ActualizarSedeInput,
  CrearSedeInput,
} from "../organization.schemas";
import { SedeRepository } from "../repositories/sede.repository";

@Injectable()
export class SedeService {
  constructor(
    private readonly sedes: SedeRepository,
    private readonly domain: DomainTransaction,
  ) {}

  listar() {
    return this.sedes.findAllActivas();
  }

  async obtener(id: number) {
    const sede = await this.sedes.findById(id);
    if (!sede) throw notFound("SEDE_NOT_FOUND");
    return sede;
  }

  crear(actor: AuthUser, key: string, input: CrearSedeInput) {
    return this.domain.run(
      actor,
      key,
      { op: "organization:sede:create", input },
      async (tx) => {
        const data = {
          nombre: input.nombre,
          direccion: input.direccion ?? null,
        };
        const existing = await this.sedes.findByNombre(input.nombre);

        if (existing?.activa) throw conflict("SEDE_ALREADY_EXISTS");

        if (existing) {
          return this.withUniqueName(() =>
            this.sedes.reactivate(existing.id, data, tx),
          );
        }

        return this.withUniqueName(() => this.sedes.create(data, tx));
      },
    );
  }

  actualizar(
    actor: AuthUser,
    key: string,
    id: number,
    input: ActualizarSedeInput,
  ) {
    return this.domain.run(
      actor,
      key,
      { op: "organization:sede:update", id, input },
      async (tx) => {
        await this.obtener(id);

        if (input.nombre !== undefined) {
          const existing = await this.sedes.findByNombre(input.nombre, id);
          if (existing) throw conflict("SEDE_ALREADY_EXISTS");
        }

        return this.withUniqueName(() => this.sedes.update(id, input, tx));
      },
    );
  }

  desactivar(actor: AuthUser, key: string, id: number) {
    return this.domain.run(
      actor,
      key,
      { op: "organization:sede:deactivate", id },
      async (tx) => {
        const sede = await this.obtener(id);
        if (!sede.activa) return sede;
        return this.sedes.deactivateCascade(id, tx);
      },
    );
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
