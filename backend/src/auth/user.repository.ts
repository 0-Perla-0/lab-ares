import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";

const authUserSelect = {
  id: true,
  codigo: true,
  email: true,
  passwordHash: true,
  rol: true,
  estado: true,
  sedeId: true,
  areaId: true,
  turnoId: true,
} as const;

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmailForAuth(email: string) {
    return this.prisma.usuario.findUnique({
      where: { email },
      select: authUserSelect,
    });
  }

  findByIdForSession(id: number) {
    return this.prisma.usuario.findUnique({
      where: { id },
      select: authUserSelect,
    });
  }
}
