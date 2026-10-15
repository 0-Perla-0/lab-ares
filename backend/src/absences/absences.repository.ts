import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

export const absenceInclude = {
  user: { select: { codigo: true } },
  justificaciones: { orderBy: { createdAt: "asc" as const } },
  apelacion: true,
} as const;
export type AbsenceRow = Prisma.AusenciaGetPayload<{
  include: typeof absenceInclude;
}>;
@Injectable()
export class AbsencesRepository {
  constructor(private readonly prisma: PrismaService) {}
  list(where: Prisma.AusenciaWhereInput, limit: number) {
    return this.prisma.ausencia.findMany({
      where,
      include: absenceInclude,
      orderBy: { id: "desc" },
      take: limit + 1,
    });
  }
  async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM Ausencia WHERE id = ${id} FOR UPDATE`;
    return tx.ausencia.findUnique({ where: { id }, include: absenceInclude });
  }
}
