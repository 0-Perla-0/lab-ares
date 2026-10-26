import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { EstadoArchivo } from "../generated/prisma/enums";
import { assertRecoveryBarrier, workersMayMutate } from "../recovery/barrier";
import { journalHash } from "../recovery/journal-integrity";
import { S3Storage } from "./s3.storage";
import { ApiException } from "../common/errors/api.exception";
import { ObjectDeletionService } from "./object-deletion.service";

type Bucket = "quarantine" | "available";
type ReconciliationAction =
  | { kind: "PROMOTE"; fileId: string; key: string }
  | { kind: "DELETE_FILE_OBJECT"; fileId: string; bucket: Bucket; key: string }
  | { kind: "MARK_MISSING"; fileId: string }
  | { kind: "DELETE_ORPHAN"; bucket: Bucket; key: string }
  // Restoring an older snapshot never deletes; it only brings the SQL up to the
  // deletions that already happened outside it.
  | { kind: "IMPORT_DELETION_INTENT"; ref: string };

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
    @Optional() private readonly deletions?: ObjectDeletionService,
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
      if (
        plan.actions.some(
          (action) =>
            action.kind === "DELETE_FILE_OBJECT" ||
            action.kind === "DELETE_ORPHAN",
        )
      )
        throw new ApiException("OBJECT_DELETION_PROTOCOL_REQUIRED", 409);
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
        await this.apply(action, recoveryRunId, barrierVersion);
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

  /**
   * Read-only candidates for the governed cleanup: unreferenced old objects and
   * redundant quarantine copies of promoted files. Nothing here deletes; the
   * cleanup service revalidates every candidate under the barrier before sealing.
   */
  async cleanupCandidates(limit = 50) {
    const take = Math.min(200, Math.max(1, limit));
    const cutoff = new Date(
      Date.now() - this.config.get("STORAGE_ORPHAN_MIN_AGE_MS"),
    );
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
      ...manifestRefs.flatMap((row) =>
        row.storageRef ? [row.storageRef] : [],
      ),
    ]);
    const orphans: { bucket: Bucket; key: string }[] = [];
    let scanned = 0;
    for (const bucket of ["quarantine", "available"] as const) {
      let cursor: string | undefined;
      do {
        const page = await this.storage.list(bucket, cursor, take);
        for (const object of page.objects)
          if (
            orphans.length < take &&
            object.lastModified &&
            object.lastModified < cutoff &&
            !referenced.has(object.key) &&
            !object.key.startsWith("deletion-intents/") &&
            !object.key.startsWith("audit-manifests/")
          )
            orphans.push({ bucket, key: object.key });
        scanned += page.objects.length;
        cursor = page.nextCursor;
      } while (cursor && orphans.length < take && scanned < take * 10);
    }
    const copies: { bucket: Bucket; key: string }[] = [];
    const promoted = await this.prisma.archivo.findMany({
      where: { status: EstadoArchivo.DISPONIBLE },
      orderBy: { updatedAt: "asc" },
      take: take * 5,
      select: { objectKey: true, quarantineKey: true },
    });
    for (const file of promoted) {
      if (copies.length >= take) break;
      if (file.objectKey !== file.quarantineKey) continue;
      const [served, redundant] = await Promise.all([
        this.storage.head("available", file.objectKey),
        this.storage.head("quarantine", file.quarantineKey),
      ]);
      if (served && redundant)
        copies.push({ bucket: "quarantine", key: file.quarantineKey });
    }
    return { orphans, quarantineCopies: copies };
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
    if (this.deletions)
      for (const ref of await this.deletions.unknownIntents(take))
        actions.push({ kind: "IMPORT_DELETION_INTENT", ref });
    actions.sort((left, right) => {
      const l = JSON.stringify(left);
      const r = JSON.stringify(right);
      return l < r ? -1 : l > r ? 1 : 0;
    });
    return { actions, inspected: files.length, scanned };
  }

  private async apply(
    action: ReconciliationAction,
    recoveryRunId: string,
    barrierVersion: number,
  ) {
    switch (action.kind) {
      case "IMPORT_DELETION_INTENT": {
        if (!this.deletions)
          throw new ApiException("OBJECT_DELETION_PROTOCOL_REQUIRED", 409);
        const imported = await this.deletions.importExternalIntent(
          action.ref,
          recoveryRunId,
          barrierVersion,
        );
        // Prove the sealed inventory is gone (read-only) and finalize in the run.
        if (imported.outcome === "IMPORTED" && imported.id) {
          const verify = await this.deletions.verifyAnyImported(
            imported.id,
            recoveryRunId,
            barrierVersion,
          );
          if (verify === "UNCONFIRMED")
            throw new ApiException("OBJECT_DELETION_IMPORT_UNCONFIRMED", 409);
        }
        return;
      }
      case "PROMOTE":
        await this.storage.copy("quarantine", "available", action.key);
        await this.prisma.archivo.updateMany({
          where: { id: action.fileId, status: EstadoArchivo.DISPONIBLE },
          data: { objectKey: action.key },
        });
        // Retain the private source until a dedicated copy-cleanup intent exists.
        return;
      case "DELETE_FILE_OBJECT":
        throw new ApiException("OBJECT_DELETION_PROTOCOL_REQUIRED", 409);
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
        throw new ApiException("OBJECT_DELETION_PROTOCOL_REQUIRED", 409);
    }
  }

  private counts(actions: ReconciliationAction[]) {
    return Object.fromEntries(
      [
        "PROMOTE",
        "DELETE_FILE_OBJECT",
        "MARK_MISSING",
        "DELETE_ORPHAN",
        "IMPORT_DELETION_INTENT",
      ].map((kind) => [
        kind,
        actions.filter((action) => action.kind === kind).length,
      ]),
    );
  }
}
