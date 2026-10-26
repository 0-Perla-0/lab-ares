import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes, randomUUID } from "node:crypto";
import { ApiException } from "../common/errors/api.exception";
import { canonicalOperation } from "../common/domain/canonical-operation";
import { withRenewingLease } from "../common/domain/renewing-lease";
import { withWorkerWriteBarrier } from "../common/domain/worker-write-barrier";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import {
  ObjectDeletionService,
  manifestHash,
  type DeletionManifest,
} from "./object-deletion.service";
import { S3Storage } from "./s3.storage";

export type CleanupKind = "ORPHAN_OBJECT" | "QUARANTINE_COPY";
export type CleanupBucket = "quarantine" | "available";
type Guard = (tx: Prisma.TransactionClient) => Promise<void>;
type JobIdentity = {
  kind: string;
  bucket: string;
  objectKey: string;
  archivoId: string | null;
};

const LEASE_MS = 120000;
/** Objects owned by other protocols are never cleaned up through this path. */
const PROTECTED_PREFIXES = ["deletion-intents/", "audit-manifests/"];
const subjectOf = (bucket: string, key: string) => `${bucket}:${key}`;

/**
 * Exact-version deletion of private objects that no Archivo owns (orphans) or that
 * a promoted file no longer needs (its quarantine copy). It reuses the sealed
 * manifest, immutable external intent and lease protocol of ObjectDeletionService,
 * keyed by bucket+key. Every effect revalidates eligibility under the write
 * barrier; a changed inventory aborts instead of widening the deletion.
 */
@Injectable()
export class OrphanObjectDeletionService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: S3Storage,
    private readonly config: ConfigService<Environment, true>,
    private readonly deletions: ObjectDeletionService,
  ) {}

  private enabledOrThrow() {
    if (!this.config.get("OBJECT_CLEANUP_ENABLED"))
      throw new ApiException("OBJECT_CLEANUP_DISABLED", 503);
  }

  /** What is being deleted must never be the reference of a live row or a hold. */
  async assertEligible(
    tx: Prisma.TransactionClient,
    input: {
      kind: CleanupKind;
      bucket: CleanupBucket;
      key: string;
      archivoId?: string | null;
    },
  ) {
    const { kind, bucket, key } = input;
    if (
      !key ||
      key.length > 500 ||
      PROTECTED_PREFIXES.some((prefix) => key.startsWith(prefix))
    )
      throw new ApiException("OBJECT_CLEANUP_KEY_PROTECTED", 409);
    const owners = await tx.archivo.findMany({
      where: { OR: [{ objectKey: key }, { quarantineKey: key }] },
      select: {
        id: true,
        status: true,
        objectKey: true,
        quarantineKey: true,
      },
      orderBy: { id: "asc" },
    });
    for (const owner of owners)
      await tx.$queryRaw`SELECT id FROM Archivo WHERE id = ${owner.id} FOR UPDATE`;
    const holds = await tx.retencionLegal.count({
      where: {
        estado: "ACTIVA",
        registro: { resourceId: { in: [key, ...owners.map((o) => o.id)] } },
      },
    });
    if (holds) throw new ApiException("RETENTION_SHARED_EVIDENCE_OR_HOLD", 409);
    if (kind === "ORPHAN_OBJECT") {
      // Residue of a file already logically deleted is still an orphan; any live
      // or in-flight owner is not.
      if (owners.some((owner) => owner.status !== "ELIMINADO"))
        throw new ApiException("OBJECT_CLEANUP_OBJECT_REFERENCED", 409);
      if (await tx.auditManifest.count({ where: { storageRef: key } }))
        throw new ApiException("OBJECT_CLEANUP_OBJECT_REFERENCED", 409);
      return;
    }
    // QUARANTINE_COPY: only the redundant private copy of a promoted, live file.
    if (bucket !== "quarantine")
      throw new ApiException("OBJECT_CLEANUP_PURPOSE_MISMATCH", 409);
    const [owner] = owners;
    if (
      owners.length !== 1 ||
      owner.status !== "DISPONIBLE" ||
      owner.objectKey !== key ||
      owner.quarantineKey !== key ||
      (input.archivoId && input.archivoId !== owner.id)
    )
      throw new ApiException("OBJECT_CLEANUP_PURPOSE_MISMATCH", 409);
    return owner;
  }

  private async assertPromoted(key: string, signal: AbortSignal) {
    // Never remove the private copy unless the served copy provably exists.
    const served = await this.storage.deletionVersions(
      "available",
      key,
      signal,
    );
    if (!served.some((version) => !version.deleteMarker))
      throw new ApiException("OBJECT_CLEANUP_SERVED_COPY_MISSING", 409);
  }

  async prepare(
    tx: Prisma.TransactionClient,
    input: { kind: CleanupKind; bucket: CleanupBucket; key: string },
  ) {
    this.enabledOrThrow();
    const owner = await this.assertEligible(tx, input);
    const signal = AbortSignal.timeout(10000);
    if (input.kind === "ORPHAN_OBJECT") {
      const modified = await this.storage.lastModified(input.bucket, input.key);
      const minAge = this.config.get("STORAGE_ORPHAN_MIN_AGE_MS");
      // Missing timestamp means unknown age: in-flight uploads must not be guessed.
      if (!modified || Date.now() - modified.getTime() < minAge)
        throw new ApiException("OBJECT_CLEANUP_TOO_RECENT", 409);
    } else await this.assertPromoted(input.key, signal);
    const existing = await tx.orphanObjectDeletion.findFirst({
      where: { activeKey: subjectOf(input.bucket, input.key) },
    });
    if (existing) {
      this.deletions.verifyObjectJob(existing);
      return existing;
    }
    const versions = await this.storage.deletionVersions(
      input.bucket,
      input.key,
      signal,
    );
    if (!versions.length)
      throw new ApiException("OBJECT_CLEANUP_NOTHING_TO_DELETE", 409);
    const id = `c${randomBytes(14).toString("hex")}`;
    const manifest = this.deletions.sign({
      protocol: "ares-object-deletion-v1",
      operationId: id,
      fileFingerprint: manifestHash(subjectOf(input.bucket, input.key)),
      purpose: input.kind,
      storageNamespace: this.storage.deletionNamespace(),
      occurredAt: new Date().toISOString(),
      keyVersion: this.config.get("SUPPRESSION_JOURNAL_KEY_VERSION"),
      targets: [{ bucket: input.bucket, key: input.key, versions }],
    });
    const hashed = manifestHash(manifest);
    const job = await tx.orphanObjectDeletion.create({
      data: {
        id,
        kind: input.kind,
        bucket: input.bucket,
        objectKey: input.key,
        activeKey: subjectOf(input.bucket, input.key),
        archivoId: owner?.id ?? null,
        manifest: manifest as Prisma.InputJsonValue,
        manifestHash: hashed,
        manifestRef: `deletion-intents/${id}-${hashed}.json`,
      },
    });
    await this.deletions.append(tx, "OBJECT_CLEANUP_PREPARED", id);
    return job;
  }

  private eligibility(tx: Prisma.TransactionClient, job: JobIdentity) {
    return this.assertEligible(tx, {
      kind: job.kind as CleanupKind,
      bucket: job.bucket as CleanupBucket,
      key: job.objectKey,
      archivoId: job.archivoId,
    });
  }

  async process(
    id: string,
    guard: Guard = async () => {},
    expectedVersion?: number,
  ) {
    this.enabledOrThrow();
    const owner = `cleanup:${randomUUID()}`;
    const claim = await withWorkerWriteBarrier(
      this.db,
      async (tx, version) => {
        await guard(tx);
        const initial = await tx.orphanObjectDeletion.findUniqueOrThrow({
          where: { id },
        });
        const manifest = this.deletions.verifyObjectJob(initial);
        await this.eligibility(tx, initial);
        await tx.$queryRaw`SELECT id FROM OrphanObjectDeletion WHERE id = ${id} FOR UPDATE`;
        const live = await tx.orphanObjectDeletion.findUniqueOrThrow({
          where: { id },
        });
        if (live.state === "VERIFIED" || live.state === "COMPLETE") return null;
        if (live.leaseUntil && live.leaseUntil > new Date())
          throw new ApiException("OBJECT_CLEANUP_LEASE_BUSY", 409);
        await tx.orphanObjectDeletion.update({
          where: { id },
          data: {
            leaseOwner: owner,
            leaseUntil: new Date(Date.now() + LEASE_MS),
            barrierVersion: version,
            attempts: { increment: 1 },
            lastErrorCode: null,
          },
        });
        return { job: live, manifest, version };
      },
      expectedVersion,
    );
    if (!claim) return;
    const renew = () =>
      withWorkerWriteBarrier(
        this.db,
        async (tx) => {
          await guard(tx);
          await this.eligibility(tx, claim.job);
          const result = await tx.orphanObjectDeletion.updateMany({
            where: {
              id,
              leaseOwner: owner,
              leaseUntil: { gt: new Date() },
              state: { in: ["PREPARED", "DISPATCHED", "UNCERTAIN"] },
            },
            data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
          });
          if (result.count !== 1)
            throw new ApiException("OBJECT_CLEANUP_LEASE_LOST", 409);
        },
        claim.version,
      );
    try {
      await withRenewingLease(LEASE_MS, renew, async () => {
        const signal = AbortSignal.timeout(30000);
        await this.deletions.publishIntent(
          claim.job.manifestRef,
          Buffer.from(canonicalOperation(claim.manifest)),
          signal,
        );
        const present = await this.deletions.inventory(
          claim.manifest.targets,
          signal,
        );
        if (claim.job.kind === "QUARANTINE_COPY")
          await this.assertPromoted(claim.job.objectKey, signal);
        await withWorkerWriteBarrier(
          this.db,
          async (tx) => {
            await guard(tx);
            await this.eligibility(tx, claim.job);
            const dispatched = await tx.orphanObjectDeletion.updateMany({
              where: { id, leaseOwner: owner, leaseUntil: { gt: new Date() } },
              data: {
                state: "DISPATCHED",
                manifestPublishedAt:
                  claim.job.manifestPublishedAt ?? new Date(),
                irreversibleAt: claim.job.irreversibleAt ?? new Date(),
              },
            });
            if (dispatched.count !== 1)
              throw new ApiException("OBJECT_CLEANUP_LEASE_LOST", 409);
            await this.deletions.append(tx, "OBJECT_CLEANUP_DISPATCHED", id);
          },
          claim.version,
        );
        // The dispatch is committed before any I/O: an ambiguous reply leaves a
        // recoverable, exactly-sealed intent instead of a silent half-delete.
        for (const target of present)
          for (const version of target.versions) {
            await renew();
            await this.storage.deleteVersion(
              target.bucket,
              target.key,
              version.id,
              signal,
            );
          }
        const remaining = await this.deletions.inventory(
          claim.manifest.targets,
          signal,
        );
        if (remaining.some((target) => target.versions.length))
          throw new ApiException("OBJECT_CLEANUP_RESULT_UNKNOWN", 409);
      });
      await withWorkerWriteBarrier(
        this.db,
        async (tx) => {
          await guard(tx);
          const verified = await tx.orphanObjectDeletion.updateMany({
            where: {
              id,
              state: "DISPATCHED",
              leaseOwner: owner,
              leaseUntil: { gt: new Date() },
            },
            data: {
              state: "VERIFIED",
              verifiedAt: new Date(),
              leaseOwner: null,
              leaseUntil: null,
              lastErrorCode: null,
            },
          });
          if (verified.count !== 1)
            throw new ApiException("OBJECT_CLEANUP_LEASE_LOST", 409);
          await this.deletions.append(tx, "OBJECT_CLEANUP_VERIFIED", id);
        },
        claim.version,
      );
    } catch (error) {
      if (!(
        error instanceof ApiException &&
        ["RECOVERY_WRITE_BARRIER_ACTIVE", "OBJECT_CLEANUP_LEASE_LOST"].includes(
          error.code,
        )
      )) {
        await withWorkerWriteBarrier(
          this.db,
          async (tx) => {
            const current = await tx.orphanObjectDeletion.findUniqueOrThrow({
              where: { id },
            });
            await tx.orphanObjectDeletion.updateMany({
              where: { id, leaseOwner: owner, leaseUntil: { gt: new Date() } },
              data: {
                state: current.irreversibleAt ? "UNCERTAIN" : "PREPARED",
                leaseOwner: null,
                leaseUntil: null,
                lastErrorCode:
                  error instanceof ApiException
                    ? error.code
                    : "OBJECT_CLEANUP_RESULT_UNKNOWN",
              },
            });
          },
          claim.version,
        );
      }
      throw error;
    }
  }

  async complete(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM OrphanObjectDeletion WHERE id = ${id} FOR UPDATE`;
    const job = await tx.orphanObjectDeletion.findUniqueOrThrow({
      where: { id },
    });
    this.deletions.verifyObjectJob(job);
    if (job.state === "COMPLETE") return;
    if (job.state !== "VERIFIED")
      throw new ApiException("OBJECT_CLEANUP_NOT_VERIFIED", 409);
    await tx.orphanObjectDeletion.update({
      where: { id },
      data: { state: "COMPLETE", completedAt: new Date(), activeKey: null },
    });
    await this.deletions.append(tx, "OBJECT_CLEANUP_COMPLETED", id);
  }

  /** Read-only: proves the exact inventory is gone; never deletes or reopens. */
  async reconcile(id: string, guard: Guard = async () => {}) {
    const job = await this.db.orphanObjectDeletion.findUniqueOrThrow({
      where: { id },
    });
    const manifest = this.deletions.verifyObjectJob(job);
    if (job.state === "COMPLETE" || job.state === "VERIFIED") return job.state;
    if (job.leaseUntil && job.leaseUntil > new Date())
      throw new ApiException("OBJECT_CLEANUP_LEASE_BUSY", 409);
    const remaining = await this.deletions.inventory(
      manifest.targets,
      AbortSignal.timeout(10000),
    );
    if (remaining.some((target) => target.versions.length))
      return "UNCONFIRMED";
    await withWorkerWriteBarrier(this.db, async (tx) => {
      await guard(tx);
      await tx.$queryRaw`SELECT id FROM OrphanObjectDeletion WHERE id = ${id} FOR UPDATE`;
      const fresh = await tx.orphanObjectDeletion.findUniqueOrThrow({
        where: { id },
      });
      if (
        (fresh.leaseUntil && fresh.leaseUntil > new Date()) ||
        fresh.state === "COMPLETE" ||
        fresh.state === "VERIFIED"
      )
        throw new ApiException("OBJECT_CLEANUP_LEASE_BUSY", 409);
      if (!fresh.manifestPublishedAt || !fresh.irreversibleAt)
        throw new ApiException("OBJECT_CLEANUP_NOT_DISPATCHED", 409);
      await tx.orphanObjectDeletion.update({
        where: { id },
        data: {
          state: "VERIFIED",
          verifiedAt: new Date(),
          leaseOwner: null,
          leaseUntil: null,
          lastErrorCode: null,
        },
      });
      await this.deletions.append(tx, "OBJECT_CLEANUP_RECONCILED", id);
    });
    return "VERIFIED";
  }

  async list(page = 1, pageSize = 20) {
    const select = {
      id: true,
      kind: true,
      bucket: true,
      state: true,
      attempts: true,
      lastErrorCode: true,
      createdAt: true,
      irreversibleAt: true,
      verifiedAt: true,
      completedAt: true,
    } as const;
    const [items, total] = await this.db.$transaction([
      this.db.orphanObjectDeletion.findMany({
        select,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.orphanObjectDeletion.count(),
    ]);
    return {
      items,
      total,
      page,
      pageSize,
      semantics:
        "VERIFIED is physical inventory evidence for the exact sealed versions. Object keys and manifests are never exposed.",
    };
  }
}

export type { DeletionManifest };
