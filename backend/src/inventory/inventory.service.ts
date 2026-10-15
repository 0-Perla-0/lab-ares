import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { AuthUser } from "../auth/auth-user";
import { AuditService } from "../auth/audit.service";
import { Permission } from "../auth/permissions";
import { DomainTransaction } from "../common/domain/domain-transaction";
import {
  organizationalScope,
  requireOrganization,
} from "../common/domain/scope";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { pilotWhere, requirePilot } from "../common/domain/operational-pilot";
import {
  inventoryQuerySchema,
  itemCreateSchema,
  loanSchema,
  loansQuerySchema,
  locationCreateSchema,
  movementSchema,
  returnSchema,
} from "./inventory.schemas";

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transaction: DomainTransaction,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}
  private enabled() {
    if (!this.config.get<boolean>("INVENTORY_ENABLED", false))
      throw new ApiException("FEATURE_DISABLED", 404);
  }
  async locations(actor: AuthUser) {
    this.enabled();
    return this.prisma.ubicacionInventario.findMany({
      where: {
        ...organizationalScope(actor, Permission.INVENTORY_READ),
        AND: [pilotWhere(this.config)],
        activa: true,
      },
      orderBy: { id: "asc" },
      take: 100,
    });
  }
  createLocation(
    actor: AuthUser,
    key: string,
    input: z.infer<typeof locationCreateSchema>,
  ) {
    this.enabled();
    requirePilot(this.config, input);
    return this.transaction.run(
      actor,
      key,
      { action: "INVENTORY_LOCATION", ...input },
      async (tx) => {
        requireOrganization(actor, Permission.INVENTORY_MANAGE, {
          sedeId: input.sedeId,
          areaId: input.areaId ?? null,
        });
        const sede = await tx.sede.findUnique({ where: { id: input.sedeId } });
        const area = input.areaId
          ? await tx.area.findUnique({ where: { id: input.areaId } })
          : null;
        if (
          !sede?.activa ||
          (input.areaId && (!area?.activa || area.sedeId !== input.sedeId))
        )
          throw new ApiException("INVENTORY_LOCATION_INVALID", 400);
        const { reason, ...data } = input;
        const row = await tx.ubicacionInventario.create({ data });
        await this.record(
          tx,
          actor,
          row,
          "INVENTORY_LOCATION_CREATED",
          String(row.id),
          reason,
        );
        return row;
      },
    );
  }
  async items(actor: AuthUser, query: z.infer<typeof inventoryQuerySchema>) {
    this.enabled();
    const rows = await this.prisma.articuloInventario.findMany({
      where: {
        ubicacion: {
          ...organizationalScope(actor, Permission.INVENTORY_READ),
          AND: [pilotWhere(this.config)],
        },
        ...(query.ubicacionId ? { ubicacionId: query.ubicacionId } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      include: { ubicacion: true },
      orderBy: { id: "desc" },
      take: query.limit + 1,
    });
    return {
      items: rows.slice(0, query.limit).map((row) => ({
        ...row,
        stockBajo:
          row.tipo === "CONSUMIBLE" &&
          row.umbralMinimo !== null &&
          row.cantidadStock.lte(row.umbralMinimo),
      })),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null,
    };
  }
  createItem(
    actor: AuthUser,
    key: string,
    input: z.infer<typeof itemCreateSchema>,
  ) {
    this.enabled();
    return this.transaction.run(
      actor,
      key,
      { action: "INVENTORY_ITEM", ...input },
      async (tx) => {
        const location = await tx.ubicacionInventario.findUnique({
          where: { id: input.ubicacionId },
        });
        if (!location?.activa)
          throw new ApiException("INVENTORY_LOCATION_INVALID", 400);
        requireOrganization(actor, Permission.INVENTORY_MANAGE, location);
        requirePilot(this.config, location);
        const { reason, ...data } = input;
        const asset = input.tipo === "ACTIVO";
        const row = await tx.articuloInventario.create({
          data: {
            ...data,
            estadoActivo: asset ? "DISPONIBLE" : null,
            cantidadStock: asset ? 1 : 0,
          },
        });
        if (asset)
          await tx.movimientoInventario.create({
            data: {
              articuloId: row.id,
              tipo: "ENTRADA",
              cantidad: 1,
              motivo: reason,
              actorId: actor.id,
            },
          });
        await this.record(
          tx,
          actor,
          location,
          "INVENTORY_ITEM_CREATED",
          row.id,
          reason,
        );
        return row;
      },
    );
  }
  async ledger(
    actor: AuthUser,
    id: string,
    query: z.infer<typeof inventoryQuerySchema>,
  ) {
    this.enabled();
    const row = await this.prisma.articuloInventario.findUnique({
      where: { id },
      include: { ubicacion: true },
    });
    if (!row) throw new ApiException("INVENTORY_ITEM_NOT_FOUND", 404);
    requirePilot(this.config, row.ubicacion);
    requireOrganization(actor, Permission.INVENTORY_READ, row.ubicacion);
    const rows = await this.prisma.movimientoInventario.findMany({
      where: {
        articuloId: id,
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: query.limit + 1,
    });
    const sum = await this.prisma.movimientoInventario.aggregate({
      where: { articuloId: id },
      _sum: { cantidad: true },
    });
    return {
      items: rows.slice(0, query.limit),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null,
      ledgerBalance: sum._sum.cantidad ?? new Prisma.Decimal(0),
    };
  }
  movement(
    actor: AuthUser,
    key: string,
    input: z.infer<typeof movementSchema>,
  ) {
    this.enabled();
    return this.transaction.run(
      actor,
      key,
      { action: "INVENTORY_MOVEMENT", ...input },
      async (tx) => {
        const row = await this.lockItem(
          tx,
          actor,
          input.articuloId,
          Permission.INVENTORY_MANAGE,
          input.version,
        );
        if (row.tipo !== "CONSUMIBLE")
          throw new ApiException("INVENTORY_CONSUMABLE_REQUIRED", 409);
        const delta = new Prisma.Decimal(input.cantidad).mul(
          input.tipo === "SALIDA" ? -1 : 1,
        );
        const balance = await this.balance(tx, row.id, row.cantidadStock);
        const next = balance.add(delta);
        if (next.lt(0) || next.gt("99999999.99"))
          throw new ApiException("INVENTORY_STOCK_INVALID", 409);
        const movement = await tx.movimientoInventario.create({
          data: {
            articuloId: row.id,
            tipo: input.tipo,
            cantidad: delta,
            motivo: input.motivo,
            actorId: actor.id,
          },
        });
        await tx.articuloInventario.update({
          where: { id: row.id },
          data: { cantidadStock: next, version: { increment: 1 } },
        });
        await this.record(
          tx,
          actor,
          row.ubicacion,
          "INVENTORY_MOVEMENT_CREATED",
          movement.id,
          input.motivo,
        );
        return { movement, cantidadStock: next, version: row.version + 1 };
      },
    );
  }
  loan(actor: AuthUser, key: string, input: z.infer<typeof loanSchema>) {
    this.enabled();
    return this.transaction.run(
      actor,
      key,
      { action: "INVENTORY_LOAN", ...input },
      async (tx) => {
        const row = await this.lockItem(
          tx,
          actor,
          input.articuloId,
          Permission.INVENTORY_LOAN,
          input.version,
        );
        const balance = await this.balance(tx, row.id, row.cantidadStock);
        if (
          row.tipo !== "ACTIVO" ||
          row.estadoActivo !== "DISPONIBLE" ||
          !balance.eq(1) ||
          (await tx.prestamoInventario.findFirst({
            where: { articuloId: row.id, estado: "ACTIVO" },
          }))
        )
          throw new ApiException("INVENTORY_ASSET_UNAVAILABLE", 409);
        const borrower = await tx.usuario.findUnique({
          where: { id: input.solicitanteId },
        });
        if (!borrower || borrower.estado !== "ACTIVA" || !borrower.sedeId)
          throw new ApiException("INVENTORY_BORROWER_INVALID", 400);
        requireOrganization(actor, Permission.INVENTORY_LOAN, {
          sedeId: borrower.sedeId,
          areaId: borrower.areaId,
        });
        requirePilot(this.config, borrower);
        const due = new Date(input.fechaLimite);
        if (due <= new Date())
          throw new ApiException("INVENTORY_DUE_INVALID", 400);
        const loan = await tx.prestamoInventario.create({
          data: {
            articuloId: row.id,
            solicitanteId: borrower.id,
            responsableId: actor.id,
            fechaLimite: due,
            observaciones: input.motivo,
          },
        });
        await tx.movimientoInventario.create({
          data: {
            articuloId: row.id,
            tipo: "PRESTAMO",
            cantidad: -1,
            motivo: input.motivo,
            actorId: actor.id,
            prestamoId: loan.id,
          },
        });
        await tx.articuloInventario.update({
          where: { id: row.id },
          data: {
            estadoActivo: "EN_PRESTAMO",
            cantidadStock: 0,
            version: { increment: 1 },
          },
        });
        await this.record(
          tx,
          actor,
          row.ubicacion,
          "INVENTORY_LOAN_CREATED",
          loan.id,
          input.motivo,
        );
        return loan;
      },
    );
  }
  async loans(actor: AuthUser, query: z.infer<typeof loansQuerySchema>) {
    this.enabled();
    const rows = await this.prisma.prestamoInventario.findMany({
      where: {
        articulo: {
          ubicacion: organizationalScope(actor, Permission.INVENTORY_READ),
        },
        estado: query.estado,
        ...(query.solicitanteId ? { solicitanteId: query.solicitanteId } : {}),
        ...(query.vencidos === "true"
          ? { fechaLimite: { lt: new Date() } }
          : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      include: { articulo: true, solicitante: { select: { codigo: true } } },
      orderBy: { id: "desc" },
      take: query.limit + 1,
    });
    return {
      items: rows.slice(0, query.limit),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null,
    };
  }
  returnLoan(
    actor: AuthUser,
    id: string,
    key: string,
    input: z.infer<typeof returnSchema>,
  ) {
    this.enabled();
    return this.transaction.run(
      actor,
      key,
      { action: "INVENTORY_RETURN", id, ...input },
      async (tx) => {
        const target = await tx.prestamoInventario.findUnique({
          where: { id },
        });
        if (!target) throw new ApiException("INVENTORY_LOAN_NOT_FOUND", 404);
        const item = await this.lockItem(
          tx,
          actor,
          target.articuloId,
          Permission.INVENTORY_LOAN,
        );
        const loan = await tx.prestamoInventario.findUnique({ where: { id } });
        if (
          !loan ||
          loan.estado !== "ACTIVO" ||
          item.estadoActivo !== "EN_PRESTAMO"
        )
          throw new ApiException("INVENTORY_LOAN_CLOSED", 409);
        const balance = await this.balance(tx, item.id, item.cantidadStock);
        if (!balance.eq(0))
          throw new ApiException("INVENTORY_LEDGER_MISMATCH", 409);
        const updated = await tx.prestamoInventario.update({
          where: { id },
          data: {
            estado: "DEVUELTO",
            fechaDevolucion: new Date(),
            devueltoAId: actor.id,
            observaciones: input.motivo,
          },
        });
        await tx.movimientoInventario.create({
          data: {
            articuloId: item.id,
            tipo: "DEVOLUCION",
            cantidad: 1,
            motivo: input.motivo,
            actorId: actor.id,
            prestamoId: id,
          },
        });
        await tx.articuloInventario.update({
          where: { id: item.id },
          data: {
            cantidadStock: 1,
            estadoActivo: input.estadoFisico,
            version: { increment: 1 },
          },
        });
        await this.record(
          tx,
          actor,
          item.ubicacion,
          "INVENTORY_LOAN_RETURNED",
          id,
          input.motivo,
        );
        return updated;
      },
    );
  }
  private async lockItem(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    id: string,
    permission: Permission,
    version?: number,
  ) {
    await tx.$queryRaw`SELECT id FROM ArticuloInventario WHERE id = ${id} FOR UPDATE`;
    const row = await tx.articuloInventario.findUnique({
      where: { id },
      include: { ubicacion: true },
    });
    if (!row) throw new ApiException("INVENTORY_ITEM_NOT_FOUND", 404);
    if (version !== undefined) requirePilot(this.config, row.ubicacion);
    requireOrganization(actor, permission, row.ubicacion);
    if (!row.ubicacion.activa)
      throw new ApiException("INVENTORY_LOCATION_INVALID", 409);
    if (version !== undefined && row.version !== version)
      throw new ApiException("INVENTORY_VERSION_CHANGED", 409);
    return row;
  }
  private async balance(
    tx: Prisma.TransactionClient,
    id: string,
    cached: Prisma.Decimal,
  ) {
    const sum = await tx.movimientoInventario.aggregate({
      where: { articuloId: id },
      _sum: { cantidad: true },
    });
    const balance = sum._sum.cantidad ?? new Prisma.Decimal(0);
    if (!balance.eq(cached))
      throw new ApiException("INVENTORY_LEDGER_MISMATCH", 409);
    return balance;
  }
  private record(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    location: { sedeId: number; areaId: number | null },
    action: string,
    id: string,
    reason: string,
  ) {
    return this.audit.append(
      {
        actorId: actor.id,
        actorRole: actor.rol,
        action,
        resource: "inventory",
        objectId: id,
        sedeId: location.sedeId,
        areaId: location.areaId ?? undefined,
        reason,
      },
      tx,
    );
  }
}
