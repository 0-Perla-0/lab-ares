import { Injectable } from "@nestjs/common";
import type {
  AreaCreateInput,
  AreaUpdateInput,
} from "../../generated/prisma/models";

import { PrismaService } from "../../database/prisma.service";
import { translateUniqueViolation } from "./prisma-errors";
import { recordOperationalHistory } from "../../common/domain/operational-history";

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
    return translateUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        const row = await tx.area.create({ data });
        await recordOperationalHistory(tx, "AREA", row.id);
        return row;
      }),
    );
  }

  update(id: number, data: UpdateData) {
    return translateUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Area WHERE id = ${id} FOR UPDATE`;
        const row = await tx.area.update({ where: { id }, data });
        if (data.sedeId !== undefined)
          await recordOperationalHistory(tx, "AREA", id);
        return row;
      }),
    );
  }

  reactivate(id: number, data: CreateData) {
    return translateUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Area WHERE id = ${id} FOR UPDATE`;
        const row = await tx.area.update({
          where: { id },
          data: { ...data, activa: true },
        });
        await recordOperationalHistory(tx, "AREA", id);
        return row;
      }),
    );
  }

  deactivateCascade(id: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Area WHERE id = ${id} FOR UPDATE`;
      const shifts = await tx.turno.findMany({
        where: { areaId: id },
        orderBy: { id: "asc" },
      });
      await tx.turno.updateMany({
        where: { areaId: id },
        data: { activo: false },
      });
      const row = await tx.area.update({
        where: { id },
        data: { activa: false },
      });
      for (const shift of shifts)
        await recordOperationalHistory(tx, "SHIFT", shift.id);
      await recordOperationalHistory(tx, "AREA", id);
      return row;
    });
  }
}
