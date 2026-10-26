import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { AuditService } from "../auth/audit.service";
import { observeWorker } from "../common/domain/worker-heartbeat";
import { workersMayMutate } from "../recovery/barrier";
import { withWorkerWriteBarrier } from "../common/domain/worker-write-barrier";
import { ApiException } from "../common/errors/api.exception";

@Injectable()
export class InventoryCheckWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private cursor: string | undefined;
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}
  onModuleInit() {
    if (!this.config.get("INVENTORY_CHECK_WORKER_ENABLED", false)) return;
    this.timer = setInterval(
      () => {
        if (!this.running)
          void observeWorker(this.db, "inventoryCheck", () => this.check());
      },
      this.config.get<number>("INVENTORY_CHECK_INTERVAL_MS", 300000),
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async check(limit = 100) {
    if (this.running) return 0;
    this.running = true;
    try {
      if (!(await workersMayMutate(this.db))) return 0;
      const items = await this.db.articuloInventario.findMany({
        where: this.cursor ? { id: { gt: this.cursor } } : {},
        orderBy: { id: "asc" },
        take: Math.min(1000, Math.max(1, limit)),
      });
      let checked = 0;
      // The first item fixes the epoch; the rest of the cycle must commit in it.
      let epoch: number | undefined;
      for (const item of items) {
        const done = await withWorkerWriteBarrier(
          this.db,
          async (tx, version) => {
            epoch = version;
            await tx.$queryRaw`SELECT id FROM ArticuloInventario WHERE id = ${item.id} FOR UPDATE`;
            const live = await tx.articuloInventario.findUnique({
              where: { id: item.id },
              include: { ubicacion: true },
            });
            if (!live) return true;
            const sum = await tx.movimientoInventario.aggregate({
              where: { articuloId: item.id },
              _sum: { cantidad: true },
            });
            if (
              !(sum._sum.cantidad ?? new Prisma.Decimal(0)).eq(
                live.cantidadStock,
              )
            ) {
              const source = `inventory:${item.id}`;
              const existing = await tx.operationalAlert.findFirst({
                where: {
                  source,
                  code: "INVENTORY_LEDGER_MISMATCH",
                  state: { not: "RESOLVED" },
                },
              });
              if (!existing) {
                await tx.operationalAlert.create({
                  data: {
                    source,
                    severity: "S2",
                    code: "INVENTORY_LEDGER_MISMATCH",
                    message:
                      "Inventory ledger and materialized balance disagree; independent review required.",
                  },
                });
                await this.audit.append(
                  {
                    actorType: "SYSTEM",
                    action: "INVENTORY_INTEGRITY_FAILED",
                    resource: "inventory",
                    objectId: item.id,
                    sedeId: live.ubicacion.sedeId,
                    areaId: live.ubicacion.areaId ?? undefined,
                  },
                  tx,
                );
              }
            }
            return true;
          },
          epoch,
        );
        checked++;
        this.cursor = item.id;
      }
      if (items.length < limit && checked === items.length)
        this.cursor = undefined;
      return checked;
    } catch (error) {
      if (
        error instanceof ApiException &&
        error.code === "RECOVERY_WRITE_BARRIER_ACTIVE"
      )
        return 0;
      throw error;
    } finally {
      this.running = false;
    }
  }
}
