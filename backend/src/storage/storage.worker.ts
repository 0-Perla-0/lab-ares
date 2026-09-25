import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { EstadoArchivo } from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import { StorageService } from "./storage.service";
import type { Environment } from "../config/environment";

/** Durable queue drain hook. Invoke from a scheduler/worker process; safe to repeat after crashes. */
@Injectable()
export class StorageWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout; private readonly owner = randomUUID(); private running = false;
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly config: ConfigService<Environment, true>) {}
  onModuleInit() { if (this.config.get("STORAGE_WORKER_ENABLED") && this.config.get("STORAGE_SCANNER_ENABLED")) this.timer = setInterval(() => void this.processDue(), this.config.get("STORAGE_WORKER_INTERVAL_MS")); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async processDue(limit = 10) {
    if (this.running) return 0; this.running = true;
    try { return await this.processDueLocked(limit); } finally { this.running = false; }
  }
  private async processDueLocked(limit: number) {
    const now = new Date(); const lease = new Date(now.getTime() + 120000);
    await this.prisma.archivo.updateMany({ where: { status: EstadoArchivo.ANALIZANDO, leaseUntil: { lt: now } }, data: { status: EstadoArchivo.ERROR_ANALISIS, leaseUntil: null, leaseOwner: null, nextAttemptAt: now } });
    const due = await this.prisma.archivo.findMany({ where: { status: { in: [EstadoArchivo.PENDIENTE_ANALISIS, EstadoArchivo.ERROR_ANALISIS] }, analysisExhaustedAt: null, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
    let count = 0; const max = this.config.get("STORAGE_MAX_ATTEMPTS"); for (const file of due) { const claim = await this.prisma.archivo.updateMany({ where: { id: file.id, status: { in: [EstadoArchivo.PENDIENTE_ANALISIS, EstadoArchivo.ERROR_ANALISIS] }, analysisAttempts: { lt: max }, analysisExhaustedAt: null }, data: { status: EstadoArchivo.ANALIZANDO, leaseUntil: lease, leaseOwner: this.owner, analysisAttempts: { increment: 1 } } }); if (claim.count) { count++; try { await this.storage.analyze(file.id, this.owner); } catch { /* isolate a failed job from the queue */ } } } await this.prisma.archivo.updateMany({ where: { status: EstadoArchivo.ERROR_ANALISIS, analysisAttempts: { gte: max }, analysisExhaustedAt: null }, data: { nextAttemptAt: null, analysisExhaustedAt: now, lastError: "límite de intentos alcanzado" } }); return count;
  }
}
