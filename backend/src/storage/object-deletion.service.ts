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
const manifestSchema = z
  .object({
    protocol: z.literal("ares-object-deletion-v1"),
    operationId: z.string(),
    fileFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    purpose: z.enum([
      "GENERATED_REPORT",
      "REJECTED_FILE",
      "ABSENCE_ATTACHMENT",
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
export type DeletionPurpose = z.infer<typeof manifestSchema>["purpose"];
const hash = (value: unknown) =>
  createHash("sha256").update(canonicalOperation(value)).digest("hex");

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
  private append(tx: Prisma.TransactionClient, action: string, id: string) {
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
    const parsed = manifestSchema.safeParse(job.manifest);
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
    if (
      manifest.operationId !== job.id ||
      manifest.fileFingerprint !== hash(job.fileId) ||
      manifest.purpose !== job.purpose ||
      hash(manifest) !== job.manifestHash ||
      job.manifestRef !== `deletion-intents/${job.id}-${job.manifestHash}.json`
    )
      throw new ApiException("OBJECT_DELETION_MANIFEST_INVALID", 409);
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

  private async inventory(targets: DeletionTarget[], signal: AbortSignal) {
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

  private async publishIntent(ref: string, body: Buffer, signal: AbortSignal) {
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
  async recoveryReady() {
    if (
      await this.db.objectDeletionJob.count({
        where: { state: { not: "COMPLETE" } },
      })
    )
      return false;
    const known = new Map<
      string,
      Awaited<ReturnType<typeof this.db.objectDeletionJob.findMany>>[number]
    >();
    let after: string | undefined;
    while (true) {
      const page = await this.db.objectDeletionJob.findMany({
        where: after ? { id: { gt: after } } : {},
        orderBy: { id: "asc" },
        take: 200,
      });
      for (const job of page) known.set(job.manifestRef, job);
      if (known.size > 10000) return false;
      if (page.length < 200) break;
      after = page.at(-1)!.id;
    }
    let cursor: string | undefined,
      seen = 0;
    do {
      const page = await this.storage.listDeletionIntents(cursor);
      for (const ref of page.keys) {
        if (++seen > 10000) return false;
        const job = known.get(ref);
        if (!job) return false;
        const manifest = this.manifest(job),
          body = Buffer.from(canonicalOperation(manifest));
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
            return false;
          }
          chunks.push(Buffer.from(chunk));
        }
        if (!Buffer.concat(chunks).equals(body)) return false;
        if (
          (
            await this.inventory(manifest.targets, AbortSignal.timeout(10000))
          ).some((target) => target.versions.length)
        )
          return false;
        known.delete(ref);
      }
      cursor = page.nextCursor;
    } while (cursor);
    return known.size === 0;
  }
}
