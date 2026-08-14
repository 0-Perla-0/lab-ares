import { Injectable } from "@nestjs/common";
import type { DiaSemana } from "../../generated/prisma/enums";
import type { Prisma } from "../../generated/prisma/client";
import type { TurnoCreateInput } from "../../generated/prisma/models";

import { PrismaService } from "../../database/prisma.service";
import { translateUniqueViolation } from "./prisma-errors";

type Datos = Pick<TurnoCreateInput, "nombre" | "horaInicio" | "horaFin"> & {
  areaId: number;
  dias: DiaSemana[];
};
type UpdateData = Partial<Datos>;

const conDias = { dias: { orderBy: { dia: "asc" as const } } };

@Injectable()
export class TurnoRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllActivos() {
    return this.prisma.turno.findMany({
      where: { activo: true },
      orderBy: [{ areaId: "asc" }, { nombre: "asc" }],
      include: conDias,
    });
  }

  findById(id: number) {
    return this.prisma.turno.findUnique({ where: { id }, include: conDias });
  }

  findByNombreEnArea(areaId: number, nombre: string, excludeId?: number) {
    return this.prisma.turno.findFirst({
      where: {
        areaId,
        nombre,
        id: excludeId === undefined ? undefined : { not: excludeId },
      },
    });
  }

  create({ dias, ...turno }: Datos) {
    return translateUniqueViolation(() =>
      this.prisma.turno.create({
        data: { ...turno, dias: { create: dias.map((dia) => ({ dia })) } },
        include: conDias,
      }),
    );
  }

  update(id: number, { dias, ...turno }: UpdateData) {
    return translateUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        if (dias !== undefined) {
          await replaceDias(tx, id, dias);
        }
        return tx.turno.update({
          where: { id },
          data: turno,
          include: conDias,
        });
      }),
    );
  }

  reactivate(id: number, { dias, ...turno }: Datos) {
    return translateUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        await replaceDias(tx, id, dias);
        return tx.turno.update({
          where: { id },
          data: { ...turno, activo: true },
          include: conDias,
        });
      }),
    );
  }

  deactivate(id: number) {
    return this.prisma.turno.update({
      where: { id },
      data: { activo: false },
      include: conDias,
    });
  }
}

async function replaceDias(
  tx: Prisma.TransactionClient,
  turnoId: number,
  dias: DiaSemana[],
) {
  await tx.turnoDia.deleteMany({ where: { turnoId } });
  await tx.turnoDia.createMany({
    data: dias.map((dia) => ({ turnoId, dia })),
  });
}
