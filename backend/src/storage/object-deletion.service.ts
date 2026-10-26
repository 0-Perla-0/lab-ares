import { Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import { ApiException } from "../common/errors/api.exception";
import { canonicalOperation } from "../common/domain/canonical-operation";
import { withWorkerWriteBarrier } from "../common/domain/worker-write-barrier";
import { withRenewingLease } from "../common/domain/renewing-lease";
import type { Environment } from "../config/environment";
import { S3Storage } from "./s3.storage";
import type { DeletionTarget } from "./storage.types";
import { AuditService } from "../auth/audit.service";
import { parseDeletionKeyring } from "./deletion-keyring";

const LEASE_MS = 120000;
export const manifestSchema = z
  .object({
    protocol: z.literal("ares-object-deletion-v1"),
    operationId: z.string(),
    fileFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    purpose: z.enum([
      "GENERATED_REPORT",
      "REJECTED_FILE",
      "ABSENCE_ATTACHMENT",
      "ORPHAN_OBJECT",
      "QUARANTINE_COPY",
    ]),
    storageNamespace: z.string().regex(/^[a-f0-9]{64}$/),
    occurredAt: z.iso.datetime(),
    keyVersion: z.string(),
    targets: z
      .array(
        z
          .object({
            bucket: z.enum(["quarantine", "available"]),
            key: z.string().min(1),
            versions: z
              .array(
                z
                  .object({
                    id: z
                      .string()
                      .min(1)
                      .refine((id) => id !== "null"),
                    etag: z.string().nullable(),
                    deleteMarker: z.boolean(),
                  })
                  .strict(),
              )
              .max(1000),
          })
          .strict(),
      )
      .max(2),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
type Guard = (tx: Prisma.TransactionClient) => Promise<void>;
export type RecoveryAssessment = {
  ready: boolean;
  unfinishedJobs: number;
  orphanIntents: Array<{
    ref: string;
    reason:
      | "NOT_IN_SQL"
      | "BODY_MISMATCH"
      | "TOO_LARGE"
      | "VERSIONS_REMAINING"
      | "MISSING_EXTERNAL_PROOF";
  }>;
  truncated: boolean;
};
export type DeletionManifest = z.infer<typeof manifestSchema>;
/** Purposes tied to an Archivo row; object-level cleanup has its own table. */
export type DeletionPurpose = Exclude<
  DeletionManifest["purpose"],
  "ORPHAN_OBJECT" | "QUARANTINE_COPY"
>;
export const manifestHash = hashOf;
function hashOf(value: unknown) {
  return createHash("sha256").update(canonicalOperation(value)).digest("hex");
}
const hash = hashOf;

/** Irreversible I/O is never inside the SQL effect transaction. A committed
 * reservation and immutable external intent survive crashes/ambiguous replies. */
@Injectable()
export class ObjectDeletionService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: S3Storage,
    private readonly config: ConfigService<Environment, true>,
    @Optional() private readonly audit?: AuditService,
  ) {}
  /** Seals an unsigned manifest with the active signing key. */
  sign(unsigned: Omit<DeletionManifest, "signature">): DeletionManifest {
    const manifest = manifestSchema.parse({
      ...unsigned,
      signature: createHmac(
        "sha256",
        this.config.get("SUPPRESSION_JOURNAL_HMAC_SECRET"),
      )
        .update(canonicalOperation(unsigned))
        .digest("hex"),
    });
    if (Buffer.byteLength(canonicalOperation(manifest)) > 1048576)
      throw new ApiException("OBJECT_DELETION_INVENTORY_TOO_LARGE", 409);
    return manifest;
  }

  append(tx: Prisma.TransactionClient, action: string, id: string) {
    return (this.audit ?? new AuditService(this.db)).append(
      {
        actorType: "SYSTEM",
        action,
        resource: "object_deletion",
        objectId: id,
      },
      tx,
    );
  }

  private async protectedFile(
    tx: Prisma.TransactionClient,
    fileId: string,
    purpose: DeletionPurpose,
    resourceId?: string | null,
  ) {
    // Absence attachments are owned by exactly one absence; the intent is bound to it.
    if (purpose === "ABSENCE_ATTACHMENT" && !resourceId)
      throw new ApiException("OBJECT_DELETION_PURPOSE_MISMATCH", 409);
    const reports = await tx.reporteExportacion.findMany({
      where: { archivoId: fileId },
      select: { id: true, status: true, expiresAt: true, nextAttemptAt: true },
    });
    const ids = [
      fileId,
      ...reports.map((row) => row.id),
      ...(purpose === "ABSENCE_ATTACHMENT" && resourceId ? [resourceId] : []),
    ].sort();
    const records = await tx.registroRetencion.findMany({
      where: { resourceId: { in: ids } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (const row of records)
      await tx.$queryRaw`SELECT id FROM RegistroRetencion WHERE id = ${row.id} FOR UPDATE`;
    if (
      await tx.retencionLegal.count({
        where: { estado: "ACTIVA", registro: { resourceId: { in: ids } } },
      })
    )
      throw new ApiException("RETENTION_SHARED_EVIDENCE_OR_HOLD", 409);
    await tx.$queryRaw`SELECT id FROM Archivo WHERE id = ${fileId} FOR UPDATE`;
    const file = await tx.archivo.findUnique({
      where: { id: fileId },
      include: {
        _count: {
          select: {
            documentoVersiones: true,
            kairosEvidence: true,
            trabajosImpresion3D: true,
            justificacionesAusencia: true,
            apelacionesAusencia: true,
          },
        },
        bibliotecaVersion: true,
        activoPublico: true,
      },
    });
    if (!file) throw new ApiException("FILE_NOT_FOUND", 404);
    const {
      justificacionesAusencia: absenceJustifications,
      apelacionesAusencia: absenceAppeals,
      ...otherReferences
    } = file._count;
    if (
      Object.values(otherReferences).some(Boolean) ||
      file.bibliotecaVersion ||
      file.activoPublico ||
      (purpose !== "ABSENCE_ATTACHMENT" &&
        (absenceJustifications || absenceAppeals))
    )
      throw new ApiException("RETENTION_SHARED_EVIDENCE_OR_HOLD", 409);
    if (purpose === "ABSENCE_ATTACHMENT") {
      if (reports.length)
        throw new ApiException("RETENTION_SHARED_EVIDENCE_OR_HOLD", 409);
      await this.assertAbsenceAttachment(tx, fileId, resourceId!, file.status);
    } else if (purpose === "GENERATED_REPORT") {
      if (
        !file.objectKey.startsWith("reports/") ||
        (file.status !== "ELIMINADO" && file.detectedMime !== "text/csv")
      )
        throw new ApiException("OBJECT_DELETION_PURPOSE_MISMATCH", 409);
      if (
        reports.some(
          (row) =>
            !(
              row.status === "EXPIRADO" ||
              (row.status === "FALLIDO" && row.nextAttemptAt === null) ||
              (row.status === "COMPLETADO" &&
                row.expiresAt &&
                row.expiresAt <= new Date())
            ),
        )
      )
        throw new ApiException("RETENTION_RESOURCE_NOT_TERMINAL", 409);
    } else if (
      reports.length ||
      !["RECHAZADO", "ELIMINACION_PENDIENTE", "ELIMINADO"].includes(file.status)
    )
      throw new ApiException("RETENTION_RESOURCE_NOT_TERMINAL", 409);
    return file;
  }

  /** Locks the owning absence and requires it terminal, appeal-closed and the only reference. */
  private async assertAbsenceAttachment(
    tx: Prisma.TransactionClient,
    fileId: string,
    absenceId: string,
    status: string,
  ) {
    await tx.$queryRaw`SELECT id FROM Ausencia WHERE id = ${absenceId} FOR UPDATE`;
    const absence = await tx.ausencia.findUnique({
      where: { id: absenceId },
      include: { apelacion: true },
    });
    if (!absence)
      throw new ApiException("RETENTION_RESOURCE_NOT_TERMINAL", 409);
    if (
      !["JUSTIFICADA", "NO_JUSTIFICADA", "CANCELADA"].includes(
        absence.estado,
      ) ||
      (absence.apelacion && !absence.apelacion.resolvedAt) ||
      (absence.apelacionLimiteAt && absence.apelacionLimiteAt >= new Date())
    )
      throw new ApiException("RETENTION_RESOURCE_NOT_TERMINAL", 409);
    const own =
      (await tx.justificacionAusencia.count({
        where: { archivoId: fileId, ausenciaId: absenceId },
      })) +
      (await tx.apelacionAusencia.count({
        where: { archivoId: fileId, ausenciaId: absenceId },
      }));
    const foreign =
      (await tx.justificacionAusencia.count({
        where: { archivoId: fileId, ausenciaId: { not: absenceId } },
      })) +
      (await tx.apelacionAusencia.count({
        where: { archivoId: fileId, ausenciaId: { not: absenceId } },
      }));
    if (foreign)
      throw new ApiException("RETENTION_SHARED_EVIDENCE_OR_HOLD", 409);
    if (!own) throw new ApiException("OBJECT_DELETION_PURPOSE_MISMATCH", 409);
    // Files still inside the scanner pipeline are owned by it, not by retention.
    if (
      ![
        "DISPONIBLE",
        "RECHAZADO",
        "ERROR_ANALISIS",
        "ELIMINACION_PENDIENTE",
        "ELIMINADO",
      ].includes(status)
    )
      throw new ApiException("RETENTION_RESOURCE_NOT_TERMINAL", 409);
  }

  async prepare(
    tx: Prisma.TransactionClient,
    fileId: string,
    purpose: DeletionPurpose,
    resourceId?: string,
  ) {
    const file = await this.protectedFile(tx, fileId, purpose, resourceId);
    const existing = await tx.objectDeletionJob.findUnique({
      where: { fileId },
    });
    if (existing) {
      if (existing.purpose !== purpose)
        throw new ApiException("OBJECT_DELETION_PURPOSE_MISMATCH", 409);
      this.manifest(existing);
      return existing;
    }
    if (file.status === "ELIMINADO" || file.status === "ELIMINACION_PENDIENTE")
      throw new ApiException("OBJECT_DELETION_LEGACY_UNVERIFIED", 409);
    const targets: DeletionTarget[] = [];
    const signal = AbortSignal.timeout(10000);
    for (const [bucket, key] of [
      ["available", file.objectKey],
      ["quarantine", file.quarantineKey],
    ] as const) {
      targets.push({
        bucket,
        key,
        versions: await this.storage.deletionVersions(bucket, key, signal),
      });
    }
    const id = `c${randomBytes(14).toString("hex")}`;
    const unsigned = {
      protocol: "ares-object-deletion-v1",
      operationId: id,
      fileFingerprint: hash(fileId),
      purpose,
      storageNamespace: this.storage.deletionNamespace(),
      occurredAt: new Date().toISOString(),
      keyVersion: this.config.get("SUPPRESSION_JOURNAL_KEY_VERSION"),
      targets,
    };
    const manifest = manifestSchema.parse({
      ...unsigned,
      signature: createHmac(
        "sha256",
        this.config.get("SUPPRESSION_JOURNAL_HMAC_SECRET"),
      )
        .update(canonicalOperation(unsigned))
        .digest("hex"),
    });
    const manifestHash = hash(manifest);
    if (Buffer.byteLength(canonicalOperation(manifest)) > 1048576)
      throw new ApiException("OBJECT_DELETION_INVENTORY_TOO_LARGE", 409);
    const job = await tx.objectDeletionJob.create({
      data: {
        id,
        fileId,
        purpose,
        resourceId,
        originalStatus: file.status,
        manifest: manifest as Prisma.InputJsonValue,
        manifestHash,
        manifestRef: `deletion-intents/${id}-${manifestHash}.json`,
      },
    });
    await tx.archivo.update({
      where: { id: fileId },
      data: { status: "ELIMINACION_PENDIENTE" },
    });
    await this.append(tx, "OBJECT_DELETION_PREPARED", id);
    return job;
  }

  private manifest(job: {
    id: string;
    fileId: string;
    purpose: string;
    manifest: unknown;
    manifestHash: string;
    manifestRef: string;
  }) {
    const manifest = this.verifySigned(job.manifest);
    if (
      manifest.operationId !== job.id ||
      manifest.fileFingerprint !== hash(job.fileId) ||
      manifest.purpose !== job.purpose ||
      hash(manifest) !== job.manifestHash ||
      job.manifestRef !== `deletion-intents/${job.id}-${job.manifestHash}.json`
    )
      throw new ApiException("OBJECT_DELETION_MANIFEST_INVALID", 409);
    // Object-level purposes belong to OrphanObjectDeletion, never to a file job.
    if (
      manifest.purpose === "ORPHAN_OBJECT" ||
      manifest.purpose === "QUARANTINE_COPY"
    )
      throw new ApiException("OBJECT_DELETION_MANIFEST_INVALID", 409);
    return manifest as DeletionManifest & { purpose: DeletionPurpose };
  }

  /** Same checks for an object-level job: identity is bucket+key, never a file. */
  verifyObjectJob(job: {
    id: string;
    kind: string;
    bucket: string;
    objectKey: string;
    manifest: unknown;
    manifestHash: string;
    manifestRef: string;
  }) {
    const manifest = this.verifySigned(job.manifest);
    const [target, ...rest] = manifest.targets;
    if (
      manifest.operationId !== job.id ||
      manifest.fileFingerprint !== hash(`${job.bucket}:${job.objectKey}`) ||
      manifest.purpose !== job.kind ||
      (manifest.purpose !== "ORPHAN_OBJECT" &&
        manifest.purpose !== "QUARANTINE_COPY") ||
      rest.length ||
      target?.bucket !== job.bucket ||
      target?.key !== job.objectKey ||
      hash(manifest) !== job.manifestHash ||
      job.manifestRef !== `deletion-intents/${job.id}-${job.manifestHash}.json`
    )
      throw new ApiException("OBJECT_DELETION_MANIFEST_INVALID", 409);
    return manifest;
  }

  /** Schema, signing key, HMAC and storage namespace; identity is checked by the caller. */
  verifySigned(raw: unknown): DeletionManifest {
    const parsed = manifestSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiException("OBJECT_DELETION_MANIFEST_INVALID", 409);
    const manifest = parsed.data;
    const version = this.config.get("SUPPRESSION_JOURNAL_KEY_VERSION"),
      current = this.config.get("SUPPRESSION_JOURNAL_HMAC_SECRET"),
      keys = parseDeletionKeyring(
        this.config.get("OBJECT_DELETION_HMAC_KEYRING"),
      );
    if (keys[version] && keys[version] !== current)
      throw new ApiException("OBJECT_DELETION_KEYRING_CONFLICT", 409);
    const secret =
      manifest.keyVersion === version ? current : keys[manifest.keyVersion];
    if (!secret)
      throw new ApiException("OBJECT_DELETION_SIGNING_KEY_UNAVAILABLE", 409);
    const { signature, ...unsigned } = manifest;
    const expected = createHmac("sha256", secret)
      .update(canonicalOperation(unsigned))
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
      throw new ApiException("OBJECT_DELETION_MANIFEST_INVALID", 409);
    if (manifest.storageNamespace !== this.storage.deletionNamespace())
      throw new ApiException("OBJECT_DELETION_STORAGE_CHANGED", 409);
    return manifest;
  }
  private identity(
    file: { objectKey: string; quarantineKey: string },
    targets: DeletionTarget[],
  ) {
    if (
      targets.length !== 2 ||
      targets.find((row) => row.bucket === "available")?.key !==
        file.objectKey ||
      targets.find((row) => row.bucket === "quarantine")?.key !==
        file.quarantineKey
    )
      throw new ApiException("OBJECT_DELETION_IDENTITY_CHANGED", 409);
  }

  async inventory(targets: DeletionTarget[], signal: AbortSignal) {
    const present: DeletionTarget[] = [];
    for (const target of targets) {
      const versions = await this.storage.deletionVersions(
        target.bucket,
        target.key,
        signal,
      );
      if (
        versions.some(
          (actual) =>
            !target.versions.some(
              (expected) =>
                canonicalOperation(actual) === canonicalOperation(expected),
            ),
        )
      )
        throw new ApiException("OBJECT_DELETION_IDENTITY_CHANGED", 409);
      present.push({ ...target, versions });
    }
    return present;
  }

  async publishIntent(ref: string, body: Buffer, signal: AbortSignal) {
    try {
      await this.storage.putSuppressionJournal(ref, body, signal);
    } catch (error) {
      const code = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        code.name !== "PreconditionFailed" &&
        code.$metadata?.httpStatusCode !== 412
      )
        throw error;
      const stream = await this.storage.getSuppressionJournal(ref, signal);
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of stream) {
        const part = Buffer.from(chunk);
        length += part.length;
        if (length > 1048576) {
          stream.destroy();
          throw new ApiException("OBJECT_DELETION_MANIFEST_CONFLICT", 409);
        }
        chunks.push(part);
      }
      if (!Buffer.concat(chunks).equals(body))
        throw new ApiException("OBJECT_DELETION_MANIFEST_CONFLICT", 409);
    }
  }

  async process(
    id: string,
    guard: Guard = async () => {},
    expectedVersion?: number,
  ) {
    const owner = `deletion:${randomUUID()}`;
    const claim = await withWorkerWriteBarrier(
      this.db,
      async (tx, version) => {
        await guard(tx);
        const initial = await tx.objectDeletionJob.findUniqueOrThrow({
          where: { id },
        });
        const manifest = this.manifest(initial);
        const file = await this.protectedFile(
          tx,
          initial.fileId,
          manifest.purpose,
          initial.resourceId,
        );
        this.identity(file, manifest.targets);
        await tx.$queryRaw`SELECT id FROM ObjectDeletionJob WHERE id = ${id} FOR UPDATE`;
        const live = await tx.objectDeletionJob.findUniqueOrThrow({
          where: { id },
        });
        if (live.state === "VERIFIED" || live.state === "COMPLETE") return null;
        if (file.status !== "ELIMINACION_PENDIENTE")
          throw new ApiException("OBJECT_DELETION_RESERVATION_LOST", 409);
        if (live.leaseUntil && live.leaseUntil > new Date())
          throw new ApiException("OBJECT_DELETION_LEASE_BUSY", 409);
        await tx.objectDeletionJob.update({
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
          const file = await this.protectedFile(
            tx,
            claim.job.fileId,
            claim.manifest.purpose,
            claim.job.resourceId,
          );
          this.identity(file, claim.manifest.targets);
          if (file.status !== "ELIMINACION_PENDIENTE")
            throw new ApiException("OBJECT_DELETION_RESERVATION_LOST", 409);
          const result = await tx.objectDeletionJob.updateMany({
            where: {
              id,
              leaseOwner: owner,
              leaseUntil: { gt: new Date() },
              state: { in: ["PREPARED", "DISPATCHED", "UNCERTAIN"] },
            },
            data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
          });
          if (result.count !== 1)
            throw new ApiException("OBJECT_DELETION_LEASE_LOST", 409);
        },
        claim.version,
      );
    try {
      await withRenewingLease(LEASE_MS, renew, async () => {
        const signal = AbortSignal.timeout(30000);
        await this.publishIntent(
          claim.job.manifestRef,
          Buffer.from(canonicalOperation(claim.manifest)),
          signal,
        );
        const present = await this.inventory(claim.manifest.targets, signal);
        await withWorkerWriteBarrier(
          this.db,
          async (tx) => {
            await guard(tx);
            await this.protectedFile(
              tx,
              claim.job.fileId,
              claim.manifest.purpose,
              claim.job.resourceId,
            );
            const dispatched = await tx.objectDeletionJob.updateMany({
              where: { id, leaseOwner: owner, leaseUntil: { gt: new Date() } },
              data: {
                state: "DISPATCHED",
                manifestPublishedAt:
                  claim.job.manifestPublishedAt ?? new Date(),
                irreversibleAt: claim.job.irreversibleAt ?? new Date(),
              },
            });
            if (dispatched.count !== 1)
              throw new ApiException("OBJECT_DELETION_LEASE_LOST", 409);
            await this.append(tx, "OBJECT_DELETION_DISPATCHED", id);
          },
          claim.version,
        );
        // Point of no return is committed BEFORE I/O. A freeze can stop further
        // starts, but an already dispatched exact-version DELETE cannot be undone.
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
        const remaining = await this.inventory(claim.manifest.targets, signal);
        if (remaining.some((target) => target.versions.length))
          throw new ApiException("OBJECT_DELETION_RESULT_UNKNOWN", 409);
      });
      await withWorkerWriteBarrier(
        this.db,
        async (tx) => {
          await guard(tx);
          const verified = await tx.objectDeletionJob.updateMany({
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
            throw new ApiException("OBJECT_DELETION_LEASE_LOST", 409);
          await this.append(tx, "OBJECT_DELETION_VERIFIED", id);
        },
        claim.version,
      );
    } catch (error) {
      // SQL failure/epoch loss never discards an already committed dispatch.
      // Its exact manifest remains recoverable by another owner or read-only
      // reconciliation after the lease expires.
      if (!(
        error instanceof ApiException &&
        [
          "RECOVERY_WRITE_BARRIER_ACTIVE",
          "OBJECT_DELETION_LEASE_LOST",
        ].includes(error.code)
      )) {
        await withWorkerWriteBarrier(
          this.db,
          async (tx) => {
            const current = await tx.objectDeletionJob.findUniqueOrThrow({
              where: { id },
            });
            await tx.objectDeletionJob.updateMany({
              where: { id, leaseOwner: owner, leaseUntil: { gt: new Date() } },
              data: {
                state: current.irreversibleAt ? "UNCERTAIN" : "PREPARED",
                leaseOwner: null,
                leaseUntil: null,
                lastErrorCode:
                  error instanceof ApiException
                    ? error.code
                    : "OBJECT_DELETION_RESULT_UNKNOWN",
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
    const initial = await tx.objectDeletionJob.findUniqueOrThrow({
      where: { id },
    });
    const manifest = this.manifest(initial);
    const file = await this.protectedFile(
      tx,
      initial.fileId,
      manifest.purpose,
      initial.resourceId,
    );
    this.identity(file, manifest.targets);
    await tx.$queryRaw`SELECT id FROM ObjectDeletionJob WHERE id = ${id} FOR UPDATE`;
    const job = await tx.objectDeletionJob.findUniqueOrThrow({ where: { id } });
    this.manifest(job);
    if (job.state === "COMPLETE") return;
    if (job.state !== "VERIFIED")
      throw new ApiException("OBJECT_DELETION_NOT_VERIFIED", 409);
    await tx.archivo.update({
      where: { id: job.fileId },
      data: {
        status: "ELIMINADO",
        propietarioId: null,
        originalName: "[SUPRIMIDO]",
        detectedMime: null,
        extension: null,
        sha256: null,
        lastError: null,
      },
    });
    await tx.analisisArchivo.updateMany({
      where: { archivoId: job.fileId },
      data: { signature: null, error: null },
    });
    await tx.objectDeletionJob.update({
      where: { id },
      data: { state: "COMPLETE", completedAt: new Date() },
    });
    await this.append(tx, "OBJECT_DELETION_COMPLETED", id);
  }

  async reconcile(id: string, guard: Guard = async () => {}) {
    const job = await this.db.objectDeletionJob.findUniqueOrThrow({
      where: { id },
    });
    const manifest = this.manifest(job);
    if (job.state === "COMPLETE" || job.state === "VERIFIED") return job.state;
    if (job.leaseUntil && job.leaseUntil > new Date())
      throw new ApiException("OBJECT_DELETION_LEASE_BUSY", 409);
    const remaining = await this.inventory(
      manifest.targets,
      AbortSignal.timeout(10000),
    );
    if (remaining.some((target) => target.versions.length))
      return "UNCONFIRMED";
    // Read-only external reconciliation never emits DELETE, restores access or
    // manufactures a completed domain receipt. It only proves the exact inventory.
    await withWorkerWriteBarrier(this.db, async (tx) => {
      await guard(tx);
      await tx.$queryRaw`SELECT id FROM ObjectDeletionJob WHERE id = ${id} FOR UPDATE`;
      const fresh = await tx.objectDeletionJob.findUniqueOrThrow({
        where: { id },
      });
      if (
        (fresh.leaseUntil && fresh.leaseUntil > new Date()) ||
        fresh.state === "COMPLETE" ||
        fresh.state === "VERIFIED"
      )
        throw new ApiException("OBJECT_DELETION_LEASE_BUSY", 409);
      if (!fresh.manifestPublishedAt || !fresh.irreversibleAt)
        throw new ApiException("OBJECT_DELETION_NOT_DISPATCHED", 409);
      await tx.objectDeletionJob.update({
        where: { id },
        data: {
          state: "VERIFIED",
          verifiedAt: new Date(),
          leaseOwner: null,
          leaseUntil: null,
          lastErrorCode: null,
        },
      });
      await this.append(tx, "OBJECT_DELETION_RECONCILED", id);
    });
    return "VERIFIED";
  }
  /** Every external intent a restored SQL snapshot may or may not know about. */
  private async knownIntents() {
    const known = new Map<string, DeletionManifest>();
    let after: string | undefined;
    for (;;) {
      const page = await this.db.objectDeletionJob.findMany({
        where: after ? { id: { gt: after } } : {},
        orderBy: { id: "asc" },
        take: 200,
      });
      for (const job of page) known.set(job.manifestRef, this.manifest(job));
      if (known.size > 10000) return null;
      if (page.length < 200) break;
      after = page.at(-1)!.id;
    }
    let afterOrphan: string | undefined;
    for (;;) {
      const page = await this.db.orphanObjectDeletion.findMany({
        where: afterOrphan ? { id: { gt: afterOrphan } } : {},
        orderBy: { id: "asc" },
        take: 200,
      });
      for (const job of page)
        known.set(job.manifestRef, this.verifyObjectJob(job));
      if (known.size > 10000) return null;
      if (page.length < 200) break;
      afterOrphan = page.at(-1)!.id;
    }
    return known;
  }

  private async acknowledgedRefs() {
    const rows = await this.db.objectDeletionAcknowledgement.findMany({
      select: { manifestRef: true },
      take: 10001,
    });
    return new Set(rows.map((row) => row.manifestRef));
  }

  /** Read-only, bounded comparison between SQL intents and the external intent
   * store. It never imports, deletes or closes anything; it only explains why
   * reopening is (not) safe. Caps fail closed through `truncated`. */
  async recoveryAssessment(): Promise<RecoveryAssessment> {
    const result: RecoveryAssessment = {
      ready: false,
      unfinishedJobs:
        (await this.db.objectDeletionJob.count({
          where: { state: { not: "COMPLETE" } },
        })) +
        (await this.db.orphanObjectDeletion.count({
          where: { state: { not: "COMPLETE" } },
        })),
      orphanIntents: [],
      truncated: false,
    };
    if (result.unfinishedJobs) return result;
    const known = await this.knownIntents();
    if (!known) return { ...result, truncated: true };
    const acknowledged = await this.acknowledgedRefs();
    let cursor: string | undefined,
      seen = 0;
    do {
      const page = await this.storage.listDeletionIntents(cursor);
      for (const ref of page.keys) {
        if (++seen > 10000) return { ...result, truncated: true };
        if (acknowledged.has(ref)) continue;
        const manifest = known.get(ref);
        if (!manifest) {
          // Written after the restored snapshot: SQL does not know this intent.
          result.orphanIntents.push({ ref, reason: "NOT_IN_SQL" });
          continue;
        }
        const body = Buffer.from(canonicalOperation(manifest));
        const stream = await this.storage.getSuppressionJournal(
          ref,
          AbortSignal.timeout(10000),
        );
        const chunks: Buffer[] = [];
        let size = 0;
        let tooLarge = false;
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > 1048576) {
            stream.destroy();
            tooLarge = true;
            break;
          }
          chunks.push(Buffer.from(chunk));
        }
        if (tooLarge) {
          result.orphanIntents.push({ ref, reason: "TOO_LARGE" });
          continue;
        }
        if (!Buffer.concat(chunks).equals(body)) {
          result.orphanIntents.push({ ref, reason: "BODY_MISMATCH" });
          continue;
        }
        if (
          (
            await this.inventory(manifest.targets, AbortSignal.timeout(10000))
          ).some((target) => target.versions.length)
        ) {
          result.orphanIntents.push({ ref, reason: "VERSIONS_REMAINING" });
          continue;
        }
        known.delete(ref);
      }
      cursor = page.nextCursor;
    } while (cursor);
    // SQL intents with no external proof also block reopening.
    for (const ref of known.keys())
      result.orphanIntents.push({ ref, reason: "MISSING_EXTERNAL_PROOF" });
    result.ready = result.orphanIntents.length === 0;
    return result;
  }

  async recoveryReady() {
    return (await this.recoveryAssessment()).ready;
  }

  /** External intents (bounded) that neither a job nor an acknowledgement explains. */
  async unknownIntents(limit = 100) {
    const known = await this.knownIntents();
    if (!known)
      throw new ApiException("OBJECT_DELETION_INVENTORY_TOO_LARGE", 409);
    const acknowledged = await this.acknowledgedRefs();
    const refs: string[] = [];
    let cursor: string | undefined,
      seen = 0;
    do {
      const page = await this.storage.listDeletionIntents(cursor);
      for (const ref of page.keys) {
        if (++seen > 10000)
          throw new ApiException("OBJECT_DELETION_INVENTORY_TOO_LARGE", 409);
        if (!known.has(ref) && !acknowledged.has(ref) && refs.length < limit)
          refs.push(ref);
      }
      cursor = page.nextCursor;
    } while (cursor);
    return refs.sort();
  }

  /** Control-plane writes during a freeze: valid only for the run that owns the barrier. */
  private async underRecovery<T>(
    runId: string,
    version: number,
    effect: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM RecoveryWriteBarrier WHERE id = 'global' LOCK IN SHARE MODE`;
        const barrier = await tx.recoveryWriteBarrier.findUnique({
          where: { id: "global" },
        });
        if (
          !barrier?.active ||
          barrier.runId !== runId ||
          barrier.version !== version
        )
          throw new ApiException("RECOVERY_BARRIER_LOST", 503);
        return effect(tx);
      },
      { isolationLevel: "ReadCommitted", timeout: 30000 },
    );
  }

  private async readIntent(ref: string) {
    const stream = await this.storage.getSuppressionJournal(
      ref,
      AbortSignal.timeout(10000),
    );
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > 1048576) {
        stream.destroy();
        throw new ApiException("OBJECT_DELETION_MANIFEST_INVALID", 409);
      }
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    let raw: unknown;
    try {
      raw = JSON.parse(body.toString("utf8"));
    } catch {
      throw new ApiException("OBJECT_DELETION_MANIFEST_INVALID", 409);
    }
    const manifest = this.verifySigned(raw);
    // The stored bytes must be exactly the canonical sealed manifest under its own name.
    if (
      !body.equals(Buffer.from(canonicalOperation(manifest))) ||
      ref !== `deletion-intents/${manifest.operationId}-${hash(manifest)}.json`
    )
      throw new ApiException("OBJECT_DELETION_MANIFEST_INVALID", 409);
    return manifest;
  }

  /**
   * After a restore to an earlier snapshot, imports an external intent the SQL
   * does not know. The sealed manifest is verified (HMAC, namespace, exact bytes);
   * the job enters UNCERTAIN, never DISPATCHED-by-us, so the only way forward is
   * the read-only reconcile. A subject that does not exist in the snapshot (the
   * file was created after it) is acknowledged instead of imported.
   */
  async importExternalIntent(
    ref: string,
    runId: string,
    version: number,
  ): Promise<{
    outcome: "IMPORTED" | "ACKNOWLEDGED" | "ALREADY_KNOWN";
    id?: string;
  }> {
    const manifest = await this.readIntent(ref);
    const manifestDigest = hash(manifest);
    const objectPurpose =
      manifest.purpose === "ORPHAN_OBJECT" ||
      manifest.purpose === "QUARANTINE_COPY";
    const occurredAt = new Date(manifest.occurredAt);
    return this.underRecovery(runId, version, async (tx) => {
      const known =
        (await tx.objectDeletionJob.findUnique({
          where: { manifestRef: ref },
          select: { id: true },
        })) ??
        (await tx.orphanObjectDeletion.findUnique({
          where: { manifestRef: ref },
          select: { id: true },
        })) ??
        (await tx.objectDeletionAcknowledgement.findUnique({
          where: { manifestRef: ref },
          select: { id: true },
        }));
      if (known) return { outcome: "ALREADY_KNOWN" as const };
      const acknowledge = async (reason: "SUBJECT_ABSENT_IN_SNAPSHOT") => {
        await tx.objectDeletionAcknowledgement.create({
          data: {
            manifestRef: ref,
            manifestHash: manifestDigest,
            purpose: manifest.purpose,
            reason,
            recoveryRunId: runId,
          },
        });
        await this.append(
          tx,
          "OBJECT_DELETION_INTENT_ACKNOWLEDGED",
          manifest.operationId,
        );
        return { outcome: "ACKNOWLEDGED" as const };
      };
      if (objectPurpose) {
        const target = manifest.targets[0];
        if (
          manifest.targets.length !== 1 ||
          manifest.fileFingerprint !== hash(`${target.bucket}:${target.key}`)
        )
          throw new ApiException("OBJECT_DELETION_MANIFEST_INVALID", 409);
        const owner =
          manifest.purpose === "QUARANTINE_COPY"
            ? await tx.archivo.findFirst({
                where: { quarantineKey: target.key },
                select: { id: true },
              })
            : null;
        const created = await tx.orphanObjectDeletion.create({
          data: {
            id: manifest.operationId,
            kind: manifest.purpose,
            bucket: target.bucket,
            objectKey: target.key,
            activeKey: `${target.bucket}:${target.key}`,
            archivoId: owner?.id ?? null,
            manifest: manifest as Prisma.InputJsonValue,
            manifestHash: manifestDigest,
            manifestRef: ref,
            state: "UNCERTAIN",
            manifestPublishedAt: occurredAt,
            irreversibleAt: occurredAt,
          },
        });
        await this.append(tx, "OBJECT_DELETION_INTENT_IMPORTED", created.id);
        return { outcome: "IMPORTED" as const, id: created.id };
      }
      const subject = await this.findFileByFingerprint(
        tx,
        manifest.fileFingerprint,
      );
      if (!subject) return acknowledge("SUBJECT_ABSENT_IN_SNAPSHOT");
      if (
        await tx.objectDeletionJob.findUnique({ where: { fileId: subject.id } })
      )
        throw new ApiException("OBJECT_DELETION_PURPOSE_MISMATCH", 409);
      await tx.$queryRaw`SELECT id FROM Archivo WHERE id = ${subject.id} FOR UPDATE`;
      const resourceId = await this.importedResource(
        tx,
        manifest.purpose,
        subject.id,
      );
      const job = await tx.objectDeletionJob.create({
        data: {
          id: manifest.operationId,
          fileId: subject.id,
          purpose: manifest.purpose,
          resourceId,
          originalStatus: subject.status,
          manifest: manifest as Prisma.InputJsonValue,
          manifestHash: manifestDigest,
          manifestRef: ref,
          state: "UNCERTAIN",
          manifestPublishedAt: occurredAt,
          irreversibleAt: occurredAt,
        },
      });
      // Reserve the file like prepare() does so nothing new attaches to it.
      if (subject.status !== "ELIMINADO")
        await tx.archivo.update({
          where: { id: subject.id },
          data: { status: "ELIMINACION_PENDIENTE" },
        });
      await this.append(tx, "OBJECT_DELETION_INTENT_IMPORTED", job.id);
      return { outcome: "IMPORTED" as const, id: job.id };
    });
  }

  private async findFileByFingerprint(
    tx: Prisma.TransactionClient,
    fingerprint: string,
  ) {
    // The manifest stores only hash(fileId): rediscover the subject by scanning ids.
    let after: string | undefined;
    for (let scanned = 0; scanned < 100000;) {
      const page = await tx.archivo.findMany({
        where: after ? { id: { gt: after } } : {},
        orderBy: { id: "asc" },
        take: 500,
        select: { id: true, status: true },
      });
      const hit = page.find((row) => hash(row.id) === fingerprint);
      if (hit) return hit;
      scanned += page.length;
      if (page.length < 500) return null;
      after = page.at(-1)!.id;
    }
    throw new ApiException("OBJECT_DELETION_INVENTORY_TOO_LARGE", 409);
  }

  /** The owner a purpose needs; ambiguity fails closed instead of guessing. */
  private async importedResource(
    tx: Prisma.TransactionClient,
    purpose: DeletionManifest["purpose"],
    fileId: string,
  ) {
    if (purpose === "REJECTED_FILE") return fileId;
    if (purpose === "GENERATED_REPORT") return undefined;
    const owners = new Set([
      ...(
        await tx.justificacionAusencia.findMany({
          where: { archivoId: fileId },
          select: { ausenciaId: true },
        })
      ).map((row) => row.ausenciaId),
      ...(
        await tx.apelacionAusencia.findMany({
          where: { archivoId: fileId },
          select: { ausenciaId: true },
        })
      ).map((row) => row.ausenciaId),
    ]);
    if (owners.size !== 1)
      throw new ApiException("OBJECT_DELETION_IMPORT_AMBIGUOUS", 409);
    return [...owners][0];
  }

  /**
   * Read-only proof for an imported file job, then finalization inside the same
   * recovery run. If the domain preconditions no longer hold in the restored
   * snapshot the job stays VERIFIED and reopening stays blocked.
   */
  async verifyImported(id: string, runId: string, version: number) {
    const job = await this.db.objectDeletionJob.findUniqueOrThrow({
      where: { id },
    });
    const manifest = this.manifest(job);
    const remaining = await this.inventory(
      manifest.targets,
      AbortSignal.timeout(10000),
    );
    if (remaining.some((target) => target.versions.length))
      return "UNCONFIRMED" as const;
    return this.underRecovery(runId, version, async (tx) => {
      await tx.$queryRaw`SELECT id FROM ObjectDeletionJob WHERE id = ${id} FOR UPDATE`;
      const fresh = await tx.objectDeletionJob.findUniqueOrThrow({
        where: { id },
      });
      if (fresh.state === "COMPLETE") return "COMPLETE" as const;
      if (fresh.state !== "VERIFIED")
        await tx.objectDeletionJob.update({
          where: { id },
          data: {
            state: "VERIFIED",
            verifiedAt: new Date(),
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: null,
          },
        });
      await this.append(tx, "OBJECT_DELETION_IMPORT_VERIFIED", id);
      try {
        await this.complete(tx, id);
      } catch (error) {
        if (!(error instanceof ApiException)) throw error;
        return "VERIFIED" as const;
      }
      return "COMPLETE" as const;
    });
  }

  /** Verifies whichever kind of job an import just created. */
  async verifyAnyImported(id: string, runId: string, version: number) {
    if (await this.db.objectDeletionJob.count({ where: { id } }))
      return this.verifyImported(id, runId, version);
    return this.verifyImportedObject(id, runId, version);
  }

  /** Same for an object-level job (no domain finalization beyond sealing). */
  async verifyImportedObject(id: string, runId: string, version: number) {
    const job = await this.db.orphanObjectDeletion.findUniqueOrThrow({
      where: { id },
    });
    const manifest = this.verifyObjectJob(job);
    const remaining = await this.inventory(
      manifest.targets,
      AbortSignal.timeout(10000),
    );
    if (remaining.some((target) => target.versions.length))
      return "UNCONFIRMED" as const;
    return this.underRecovery(runId, version, async (tx) => {
      await tx.$queryRaw`SELECT id FROM OrphanObjectDeletion WHERE id = ${id} FOR UPDATE`;
      const fresh = await tx.orphanObjectDeletion.findUniqueOrThrow({
        where: { id },
      });
      if (fresh.state === "COMPLETE") return "COMPLETE" as const;
      await tx.orphanObjectDeletion.update({
        where: { id },
        data: {
          state: "COMPLETE",
          verifiedAt: fresh.verifiedAt ?? new Date(),
          completedAt: new Date(),
          activeKey: null,
          leaseOwner: null,
          leaseUntil: null,
          lastErrorCode: null,
        },
      });
      await this.append(tx, "OBJECT_DELETION_IMPORT_VERIFIED", id);
      return "COMPLETE" as const;
    });
  }
}
