import { Injectable } from "@nestjs/common";
import type {
  AreaCreateInput,
  AreaUpdateInput,
} from "../../generated/prisma/models";

import { PrismaService } from "../../database/prisma.service";
import { translateUniqueViolation } from "./prisma-errors";

type CreateData = Pick<AreaCreateInput, "nombre"> & { sedeId: number };
type UpdateData = Pick<AreaUpdateInput, "nombre"> & { sedeId?: number };

@Injectable()
export class AreaRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllActivas() {
    return this.prisma.area.findMany({
      where: { activa: true },
      orderBy: [{ sedeId: "asc" }, { nombre: "asc" }],
    });
  }

  findById(id: number) {
    return this.prisma.area.findUnique({ where: { id } });
  }

  findByNombreEnSede(sedeId: number, nombre: string, excludeId?: number) {
    return this.prisma.area.findFirst({
      where: {
        sedeId,
        nombre,
        id: excludeId === undefined ? undefined : { not: excludeId },
      },
    });
  }

  create(data: CreateData) {
    return translateUniqueViolation(() => this.prisma.area.create({ data }));
  }

  update(id: number, data: UpdateData) {
    return translateUniqueViolation(() =>
      this.prisma.area.update({ where: { id }, data }),
    );
  }

  reactivate(id: number, data: CreateData) {
    return translateUniqueViolation(() =>
      this.prisma.area.update({
        where: { id },
        data: { ...data, activa: true },
      }),
    );
  }

  deactivateCascade(id: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.turno.updateMany({
        where: { areaId: id },
        data: { activo: false },
      });
      return tx.area.update({ where: { id }, data: { activa: false } });
    });
  }
}
