import { Injectable } from "@nestjs/common";
import type {
  SedeCreateInput,
  SedeUpdateInput,
} from "../../generated/prisma/models";

import { PrismaService } from "../../database/prisma.service";
import { translateUniqueViolation } from "./prisma-errors";

type CreateData = Pick<SedeCreateInput, "nombre" | "direccion">;
type UpdateData = Pick<SedeUpdateInput, "nombre" | "direccion">;

@Injectable()
export class SedeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllActivas() {
    return this.prisma.sede.findMany({
      where: { activa: true },
      orderBy: { nombre: "asc" },
    });
  }

  findById(id: number) {
    return this.prisma.sede.findUnique({ where: { id } });
  }

  findByNombre(nombre: string, excludeId?: number) {
    return this.prisma.sede.findFirst({
      where: {
        nombre,
        id: excludeId === undefined ? undefined : { not: excludeId },
      },
    });
  }

  create(data: CreateData) {
    return translateUniqueViolation(() => this.prisma.sede.create({ data }));
  }

  update(id: number, data: UpdateData) {
    return translateUniqueViolation(() =>
      this.prisma.sede.update({ where: { id }, data }),
    );
  }

  reactivate(id: number, data: CreateData) {
    return translateUniqueViolation(() =>
      this.prisma.sede.update({
        where: { id },
        data: { ...data, activa: true },
      }),
    );
  }

  deactivateCascade(id: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.turno.updateMany({
        where: { area: { sedeId: id } },
        data: { activo: false },
      });
      await tx.area.updateMany({
        where: { sedeId: id },
        data: { activa: false },
      });
      return tx.sede.update({ where: { id }, data: { activa: false } });
    });
  }
}
