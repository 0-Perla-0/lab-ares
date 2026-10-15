import { Injectable } from "@nestjs/common";

import { Prisma } from "../generated/prisma/client";
import { EstadoUsuario, type RolUsuario } from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import { translateUniqueViolation } from "../organization/repositories/prisma-errors";
import { AuditService } from "../auth/audit.service";
import { OutboxService } from "../auth/outbox.service";
import { recordOperationalHistory } from "../common/domain/operational-history";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  findAll(scope: UserListScope) {
    return this.prisma.usuario.findMany({
      where: {
        estado: { not: EstadoUsuario.DESACTIVADA },
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
      this.prisma.$transaction(async (tx) => {
        const row = await tx.usuario.create({ data, select: publicUserSelect });
        await recordOperationalHistory(tx, "USER", row.id);
        return row;
      }),
    );
  }

  update(id: number, data: UserWriteData, actorId?: number) {
    return translateUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM Usuario WHERE id = ${id} FOR UPDATE`;
        const before = await tx.usuario.findUniqueOrThrow({ where: { id } });
        const changedFields = Object.entries(data)
          .filter(
            ([key, value]) =>
              value !== undefined &&
              before[key as keyof typeof before] !== value,
          )
          .map(([key]) => key);
        const result = await tx.usuario.update({
          where: { id },
          data,
          select: publicUserSelect,
        });
        if (!changedFields.length) return result;
        if (
          changedFields.some((key) =>
            ["rol", "estado", "sedeId", "areaId", "turnoId"].includes(key),
          )
        )
          await recordOperationalHistory(tx, "USER", id);
        const sensitive = changedFields.some((key) =>
          [
            "email",
            "passwordHash",
            "rol",
            "estado",
            "sedeId",
            "areaId",
            "turnoId",
          ].includes(key),
        );
        if (sensitive) {
          await tx.session.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.recoveryToken.updateMany({
            where: { userId: id, usedAt: null },
            data: { usedAt: new Date() },
          });
          await tx.mfaChallenge.updateMany({
            where: { userId: id, consumedAt: null },
            data: { consumedAt: new Date() },
          });
          await tx.notification.create({
            data: {
              userId: id,
              type: "ACCOUNT_CHANGED",
              payload: { sessionsRevoked: true },
            },
          });
          await this.outbox.enqueue(
            {
              type: "ACCOUNT_CHANGED",
              aggregateId: String(id),
              payload: { userId: id },
            },
            tx,
          );
        }
        await this.audit.append(
          {
            actorId,
            actorType: actorId ? "HUMAN" : "SYSTEM",
            subjectId: id,
            action: "USER_UPDATED",
            resource: "identity",
            objectId: String(id),
            sedeId: result.sedeId ?? undefined,
            areaId: result.areaId ?? undefined,
            metadata: { fields: changedFields, sessionsRevoked: sensitive },
          },
          tx,
        );
        return result;
      }),
    );
  }
}
