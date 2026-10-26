import { Injectable } from "@nestjs/common";
import type {
  SedeCreateInput,
  SedeUpdateInput,
} from "../../generated/prisma/models";

import { PrismaService } from "../../database/prisma.service";
import { transact } from "../../common/domain/transact";
import type { Prisma } from "../../generated/prisma/client";
import { translateUniqueViolation } from "./prisma-errors";
import { recordOperationalHistory } from "../../common/domain/operational-history";

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

  create(data: CreateData, client?: Prisma.TransactionClient) {
    return translateUniqueViolation(() =>
      transact(this.prisma, client, async (tx) => {
        const row = await tx.sede.create({ data });
        await recordOperationalHistory(tx, "SEDE", row.id);
        return row;
      }),
    );
  }

  update(id: number, data: UpdateData, client?: Prisma.TransactionClient) {
    return translateUniqueViolation(() =>
      transact(this.prisma, client, async (tx) => {
        await tx.$queryRaw`SELECT id FROM Sede WHERE id = ${id} FOR UPDATE`;
        const row = await tx.sede.update({ where: { id }, data });
        return row;
      }),
    );
  }

  reactivate(id: number, data: CreateData, client?: Prisma.TransactionClient) {
    return translateUniqueViolation(() =>
      transact(this.prisma, client, async (tx) => {
        await tx.$queryRaw`SELECT id FROM Sede WHERE id = ${id} FOR UPDATE`;
        const row = await tx.sede.update({
          where: { id },
          data: { ...data, activa: true },
        });
        await recordOperationalHistory(tx, "SEDE", id);
        return row;
      }),
    );
  }

  deactivateCascade(id: number, client?: Prisma.TransactionClient) {
    return transact(this.prisma, client, async (tx) => {
      await tx.$queryRaw`SELECT id FROM Sede WHERE id = ${id} FOR UPDATE`;
      const shifts = await tx.turno.findMany({
        where: { area: { sedeId: id } },
        orderBy: { id: "asc" },
      });
      const areas = await tx.area.findMany({
        where: { sedeId: id },
        orderBy: { id: "asc" },
      });
      await tx.turno.updateMany({
        where: { area: { sedeId: id } },
        data: { activo: false },
      });
      await tx.area.updateMany({
        where: { sedeId: id },
        data: { activa: false },
      });
      const row = await tx.sede.update({
        where: { id },
        data: { activa: false },
      });
      for (const shift of shifts)
        await recordOperationalHistory(tx, "SHIFT", shift.id);
      for (const area of areas)
        await recordOperationalHistory(tx, "AREA", area.id);
      await recordOperationalHistory(tx, "SEDE", id);
      return row;
    });
  }
}
