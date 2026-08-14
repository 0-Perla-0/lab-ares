import { Injectable } from "@nestjs/common";

import { EstadoUsuario } from "../generated/prisma/enums";

import { verifyPassword } from "./password";
import type { AuthUser } from "./auth-user";
import { UserRepository } from "./user.repository";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid credentials");
    this.name = "InvalidCredentialsError";
  }
}

@Injectable()
export class AuthService {
  constructor(private readonly users: UserRepository) {}

  async authenticate(email: string, password: string): Promise<AuthUser> {
    const user = await this.users.findByEmailForAuth(email);

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);

    if (!passwordMatches || user.estado !== EstadoUsuario.ACTIVO) {
      throw new InvalidCredentialsError();
    }

    return {
      id: user.id,
      codigo: user.codigo,
      email: user.email,
      rol: user.rol,
      estado: user.estado,
      sedeId: user.sedeId,
      areaId: user.areaId,
      turnoId: user.turnoId,
    };
  }
}
