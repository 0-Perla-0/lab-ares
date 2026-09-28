import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { EstadoArchivo } from "../generated/prisma/enums";
import { assertRecoveryBarrier, workersMayMutate } from "../recovery/barrier";
import { journalHash } from "../recovery/journal-integrity";
import { S3Storage } from "./s3.storage";

type Bucket = "quarantine" | "available";
type ReconciliationAction =
  | { kind: "PROMOTE"; fileId: string; key: string }
  | { kind: "DELETE_FILE_OBJECT"; fileId: string; bucket: Bucket; key: string }
  | { kind: "MARK_MISSING"; fileId: string }
  | { kind: "DELETE_ORPHAN"; bucket: Bucket; key: string };

interface ReconciliationPlan {
  actions: ReconciliationAction[];
  inspected: number;
  scanned: number;
}

/** Preview-only timer plus governed execution for an active recovery run. */
@Injectable()
export class StorageReconciler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3Storage,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  onModuleInit() {
    if (!this.config.get("STORAGE_RECONCILER_ENABLED")) return;
    this.timer = setInterval(() => {
      if (!this.running) void this.run().catch(() => undefined);
    }, this.config.get("STORAGE_WORKER_INTERVAL_MS"));
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(limit = 100) {
    if (!(await workersMayMutate(this.prisma)))
      return { inspected: 0, scanned: 0, proposed: 0, frozen: true };
    return this.preview(limit);
  }

  async preview(limit = 100) {
    if (this.running)
      return { inspected: 0, scanned: 0, proposed: 0, planHash: null };
    this.running = true;
    try {
      const plan = await this.buildPlan(limit);
      return {
        inspected: plan.inspected,
        scanned: plan.scanned,
        proposed: plan.actions.length,
        counts: this.counts(plan.actions),
        planHash: journalHash(plan.actions),
      };
    } finally {
      this.running = false;
    }
  }

  async execute(
    limit: number,
    expectedPlanHash: string,
    recoveryRunId: string,
    barrierVersion: number,
  ) {
    if (this.running) throw new Error("RECONCILIATION_ALREADY_RUNNING");
    this.running = true;
    try {
      if (
        !(await assertRecoveryBarrier(
          this.prisma,
          recoveryRunId,
          barrierVersion,
        ))
      )
        throw new Error("RECOVERY_BARRIER_LOST");
      const plan = await this.buildPlan(limit);
      if (journalHash(plan.actions) !== expectedPlanHash)
        throw new Error("RECONCILIATION_PREVIEW_STALE");
      let repaired = 0;
      for (const action of plan.actions) {
        if (
          !(await assertRecoveryBarrier(
            this.prisma,
            recoveryRunId,
            barrierVersion,
          ))
        )
          throw new Error("RECOVERY_BARRIER_LOST");
        await this.apply(action);
        repaired += 1;
      }
      return {
        inspected: plan.inspected,
        scanned: plan.scanned,
        repaired,
        counts: this.counts(plan.actions),
        planHash: expectedPlanHash,
      };
    } finally {
      this.running = false;
    }
  }

  private async buildPlan(limit: number): Promise<ReconciliationPlan> {
    const take = Math.min(1000, Math.max(1, limit));
    const files = await this.prisma.archivo.findMany({
      take,
      orderBy: { updatedAt: "asc" },
    });
    const [fileRefs, manifestRefs] = await Promise.all([
      this.prisma.archivo.findMany({
        select: { objectKey: true, quarantineKey: true },
      }),
      this.prisma.auditManifest.findMany({
        where: { storageRef: { not: null } },
        select: { storageRef: true },
      }),
    ]);
    const referenced = new Set([
      ...fileRefs.flatMap((file) => [file.objectKey, file.quarantineKey]),
      ...manifestRefs.flatMap((manifest) =>
        manifest.storageRef ? [manifest.storageRef] : [],
      ),
    ]);
    const actions: ReconciliationAction[] = [];
    const cutoff = new Date(
      Date.now() - this.config.get("STORAGE_ORPHAN_MIN_AGE_MS"),
    );
    for (const file of files) {
      let available: boolean;
      let quarantine: boolean;
      try {
        [available, quarantine] = await Promise.all([
          this.storage.head("available", file.objectKey),
          this.storage.head("quarantine", file.quarantineKey),
        ]);
      } catch {
        continue;
      }
      if (file.createdAt > cutoff) continue;
      if (file.status === EstadoArchivo.DISPONIBLE && !available && quarantine)
        actions.push({
          kind: "PROMOTE",
          fileId: file.id,
          key: file.quarantineKey,
        });
      else if (file.status === EstadoArchivo.ELIMINADO) {
        if (available)
          actions.push({
            kind: "DELETE_FILE_OBJECT",
            fileId: file.id,
            bucket: "available",
            key: file.objectKey,
          });
        if (quarantine)
          actions.push({
            kind: "DELETE_FILE_OBJECT",
            fileId: file.id,
            bucket: "quarantine",
            key: file.quarantineKey,
          });
      } else if (
        file.status !== EstadoArchivo.DISPONIBLE &&
        !quarantine &&
        !available
      )
        actions.push({ kind: "MARK_MISSING", fileId: file.id });
    }
    let scanned = 0;
    for (const bucket of ["quarantine", "available"] as const) {
      let cursor: string | undefined;
      do {
        let page;
        try {
          page = await this.storage.list(bucket, cursor, take);
        } catch {
          break;
        }
        for (const object of page.objects)
          if (
            object.lastModified &&
            object.lastModified < cutoff &&
            !referenced.has(object.key)
          )
            actions.push({ kind: "DELETE_ORPHAN", bucket, key: object.key });
        scanned += page.objects.length;
        cursor = page.nextCursor;
      } while (cursor && scanned < take * 10);
    }
    actions.sort((left, right) => {
      const l = JSON.stringify(left);
      const r = JSON.stringify(right);
      return l < r ? -1 : l > r ? 1 : 0;
    });
    return { actions, inspected: files.length, scanned };
  }

  private async apply(action: ReconciliationAction) {
    switch (action.kind) {
      case "PROMOTE":
        await this.storage.copy("quarantine", "available", action.key);
        await this.prisma.archivo.updateMany({
          where: { id: action.fileId, status: EstadoArchivo.DISPONIBLE },
          data: { objectKey: action.key },
        });
        await this.storage.delete("quarantine", action.key);
        return;
      case "DELETE_FILE_OBJECT":
        await this.storage.delete(action.bucket, action.key);
        return;
      case "MARK_MISSING":
        await this.prisma.archivo.updateMany({
          where: {
            id: action.fileId,
            status: { not: EstadoArchivo.DISPONIBLE },
          },
          data: {
            status: EstadoArchivo.ERROR_ANALISIS,
            lastError: "objeto ausente",
          },
        });
        return;
      case "DELETE_ORPHAN":
        await this.storage.delete(action.bucket, action.key);
    }
  }

  private counts(actions: ReconciliationAction[]) {
    return Object.fromEntries(
      ["PROMOTE", "DELETE_FILE_OBJECT", "MARK_MISSING", "DELETE_ORPHAN"].map(
        (kind) => [
          kind,
          actions.filter((action) => action.kind === kind).length,
        ],
      ),
    );
  }
}
