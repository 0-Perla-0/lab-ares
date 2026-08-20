import { Injectable } from "@nestjs/common";

import { Prisma } from "../generated/prisma/client";
import { EstadoUsuario, type RolUsuario } from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import { translateUniqueViolation } from "../organization/repositories/prisma-errors";

const publicUserSelect = {
  id: true,
  codigo: true,
  email: true,
  rol: true,
  estado: true,
  sedeId: true,
  areaId: true,
  turnoId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicUser = Prisma.UsuarioGetPayload<{
  select: typeof publicUserSelect;
}>;

export type UserListScope =
  | { type: "global" }
  | { type: "sede"; sedeId: number }
  | { type: "area"; areaId: number };

type UserWriteData = {
  codigo?: string;
  email?: string;
  passwordHash?: string;
  rol?: RolUsuario;
  estado?: EstadoUsuario;
  sedeId?: number | null;
  areaId?: number | null;
  turnoId?: number | null;
};

type CreateUserData = Required<
  Pick<UserWriteData, "codigo" | "email" | "passwordHash" | "rol" | "estado">
> &
  Pick<UserWriteData, "sedeId" | "areaId" | "turnoId">;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(scope: UserListScope) {
    return this.prisma.usuario.findMany({
      where: {
        estado: { not: EstadoUsuario.BAJA },
        sedeId: scope.type === "sede" ? scope.sedeId : undefined,
        areaId: scope.type === "area" ? scope.areaId : undefined,
      },
      orderBy: [{ codigo: "asc" }, { id: "asc" }],
      select: publicUserSelect,
    });
  }

  findById(id: number) {
    return this.prisma.usuario.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  findCollision(input: {
    codigo?: string;
    email?: string;
    excludeId?: number;
  }) {
    const OR: Prisma.UsuarioWhereInput[] = [];
    if (input.codigo !== undefined) OR.push({ codigo: input.codigo });
    if (input.email !== undefined) OR.push({ email: input.email });
    if (OR.length === 0) return Promise.resolve(null);

    return this.prisma.usuario.findFirst({
      where: {
        OR,
        id:
          input.excludeId === undefined ? undefined : { not: input.excludeId },
      },
      select: { id: true, codigo: true, email: true },
    });
  }

  create(data: CreateUserData) {
    return translateUniqueViolation(() =>
      this.prisma.usuario.create({ data, select: publicUserSelect }),
    );
  }

  update(id: number, data: UserWriteData) {
    return translateUniqueViolation(() =>
      this.prisma.usuario.update({
        where: { id },
        data,
        select: publicUserSelect,
      }),
    );
  }
}
