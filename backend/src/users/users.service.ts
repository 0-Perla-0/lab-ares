import { Injectable } from "@nestjs/common";

import { hashPassword } from "../auth/password";
import {
  conflict,
  invalidInput,
  notFound,
} from "../common/errors/domain-error";
import { UniqueConstraintError } from "../common/errors/unique-constraint-error";
import { EstadoUsuario } from "../generated/prisma/enums";
import { AreaRepository } from "../organization/repositories/area.repository";
import { SedeRepository } from "../organization/repositories/sede.repository";
import { TurnoRepository } from "../organization/repositories/turno.repository";
import type { ActualizarUsuarioInput, CrearUsuarioInput } from "./user.schemas";
import { UsersRepository, type UserListScope } from "./users.repository";

type UserAssignments = Pick<CrearUsuarioInput, "sedeId" | "areaId" | "turnoId">;

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sedes: SedeRepository,
    private readonly areas: AreaRepository,
    private readonly turnos: TurnoRepository,
  ) {}

  listar(scope: UserListScope) {
    return this.users.findAll(scope);
  }

  async obtener(id: number) {
    const user = await this.users.findById(id);
    if (!user) throw notFound("USER_NOT_FOUND");
    return user;
  }

  async crear(input: CrearUsuarioInput) {
    await this.ensureAssignments(input);
    await this.ensureUniqueIdentity(input.codigo, input.email);

    const { password, ...user } = input;
    const passwordHash = await hashPassword(password);

    return this.withUniqueIdentity(() =>
      this.users.create({ ...user, passwordHash }),
    );
  }

  async actualizar(id: number, input: ActualizarUsuarioInput) {
    const current = await this.obtener(id);
    const assignments: UserAssignments = {
      sedeId: input.sedeId === undefined ? current.sedeId : input.sedeId,
      areaId: input.areaId === undefined ? current.areaId : input.areaId,
      turnoId: input.turnoId === undefined ? current.turnoId : input.turnoId,
    };

    await this.ensureAssignments(assignments);
    await this.ensureUniqueIdentity(input.codigo, input.email, id);

    const { password, ...changes } = input;
    const data = {
      ...changes,
      passwordHash:
        password === undefined ? undefined : await hashPassword(password),
    };

    return this.withUniqueIdentity(() => this.users.update(id, data));
  }

  async darDeBaja(id: number) {
    const current = await this.obtener(id);
    if (current.estado === EstadoUsuario.BAJA) return current;
    return this.users.update(id, { estado: EstadoUsuario.BAJA });
  }

  private async ensureUniqueIdentity(
    codigo?: string,
    email?: string,
    excludeId?: number,
  ): Promise<void> {
    const collision = await this.users.findCollision({
      codigo,
      email,
      excludeId,
    });

    if (codigo !== undefined && collision?.codigo === codigo) {
      throw conflict("USER_CODE_ALREADY_EXISTS");
    }
    if (email !== undefined && collision?.email === email) {
      throw conflict("USER_EMAIL_ALREADY_EXISTS");
    }
  }

  private async ensureAssignments(input: UserAssignments): Promise<void> {
    if (input.areaId !== null && input.sedeId === null) {
      throw invalidInput("USER_AREA_REQUIRES_SEDE");
    }
    if (input.turnoId !== null && input.areaId === null) {
      throw invalidInput("USER_TURNO_REQUIRES_AREA");
    }

    if (input.sedeId !== null) {
      const sede = await this.sedes.findById(input.sedeId);
      if (!sede) throw notFound("SEDE_NOT_FOUND");
      if (!sede.activa) throw conflict("SEDE_INACTIVE");
    }

    if (input.areaId !== null) {
      const area = await this.areas.findById(input.areaId);
      if (!area) throw notFound("AREA_NOT_FOUND");
      if (!area.activa) throw conflict("AREA_INACTIVE");
      if (area.sedeId !== input.sedeId) {
        throw invalidInput("USER_AREA_NOT_IN_SEDE");
      }
    }

    if (input.turnoId !== null) {
      const turno = await this.turnos.findById(input.turnoId);
      if (!turno) throw notFound("TURNO_NOT_FOUND");
      if (!turno.activo) throw conflict("TURNO_INACTIVE");
      if (turno.areaId !== input.areaId) {
        throw invalidInput("USER_TURNO_NOT_IN_AREA");
      }
    }
  }

  private async withUniqueIdentity<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw conflict("USER_ALREADY_EXISTS");
      }
      throw error;
    }
  }
}
