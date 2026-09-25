import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EstadoArchivo } from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import { S3Storage } from "./s3.storage";
import type { Environment } from "../config/environment";

/** Repairs interrupted promotions and removes only old, unreferenced objects. */
@Injectable()
export class StorageReconciler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout; private running = false;
  constructor(private readonly prisma: PrismaService, private readonly storage: S3Storage, private readonly config: ConfigService<Environment, true>) {}
  onModuleInit() { if (this.config.get("STORAGE_RECONCILER_ENABLED")) this.timer = setInterval(() => { if (!this.running) void this.run().catch(() => undefined); }, this.config.get("STORAGE_WORKER_INTERVAL_MS")); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async run(limit = 100) { if (this.running) return { inspected: 0, scanned: 0, repaired: 0 }; this.running = true; try { return await this.runOnce(limit); } finally { this.running = false; } }
  private async runOnce(limit = 100) {
    const files = await this.prisma.archivo.findMany({ take: limit, orderBy: { updatedAt: "asc" } });
    const allRefs = await this.prisma.archivo.findMany({ select: { objectKey: true, quarantineKey: true } });
    const referenced = new Set(allRefs.flatMap((f) => [f.objectKey, f.quarantineKey]));
    let repaired = 0;
    for (const file of files) {
      let available: boolean | undefined; let quarantine: boolean | undefined;
      try { available = await this.storage.head("available", file.objectKey); } catch { continue; }
      try { quarantine = await this.storage.head("quarantine", file.quarantineKey); } catch { continue; }
      try {
        if (file.createdAt && file.createdAt > new Date(Date.now() - this.config.get("STORAGE_ORPHAN_MIN_AGE_MS"))) continue;
        if (file.status === EstadoArchivo.DISPONIBLE && !available && quarantine) {
          await this.storage.copy("quarantine", "available", file.quarantineKey);
          await this.prisma.archivo.update({ where: { id: file.id }, data: { objectKey: file.quarantineKey } });
          try { await this.storage.delete("quarantine", file.quarantineKey); } catch { /* residue is safe and retried */ }
          repaired++;
        } else if (file.status === EstadoArchivo.ELIMINADO && (available || quarantine)) {
          if (available) await this.storage.delete("available", file.objectKey);
          if (quarantine) await this.storage.delete("quarantine", file.quarantineKey);
          repaired++;
        } else if (file.status !== EstadoArchivo.DISPONIBLE && !quarantine && !available) {
          await this.prisma.archivo.update({ where: { id: file.id }, data: { status: EstadoArchivo.ERROR_ANALISIS, lastError: "objeto ausente" } });
        }
      } catch {
        await this.prisma.archivo.update({ where: { id: file.id }, data: { status: EstadoArchivo.ERROR_ANALISIS, lastError: "reconciliación fallida" } });
      }
    }
    const cutoff = new Date(Date.now() - this.config.get("STORAGE_ORPHAN_MIN_AGE_MS"));
    let scanned = 0;
    for (const bucket of ["quarantine", "available"] as const) { let cursor: string | undefined;
    do {
      let page; try { page = await this.storage.list(bucket, cursor, limit); } catch { break; }
      for (const object of page.objects) if (object.lastModified && object.lastModified < cutoff && !referenced.has(object.key)) { try { await this.storage.delete(bucket, object.key); repaired++; } catch {} }
      scanned += page.objects.length; cursor = page.nextCursor;
    } while (cursor && scanned < limit * 10); }
    return { inspected: files.length, scanned, repaired };
  }
}
