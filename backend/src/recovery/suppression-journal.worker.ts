import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { S3Storage } from "../storage/s3.storage";
import { workersMayMutate } from "./barrier";
import { type JournalEnvelope, signJournalEnvelope } from "./journal-integrity";
import { observeWorker } from "../common/domain/worker-heartbeat";
import { withWorkerWriteBarrier } from "../common/domain/worker-write-barrier";
import { withRenewingLease } from "../common/domain/renewing-lease";
import { ApiException } from "../common/errors/api.exception";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 120_000;

@Injectable()
export class SuppressionJournalWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly owner = `suppression-journal:${process.pid}:${randomUUID()}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3Storage,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  onModuleInit() {
    if (!this.config.get("SUPPRESSION_JOURNAL_WORKER_ENABLED")) return;
    this.timer = setInterval(
      () => this.schedule(),
      this.config.get("SUPPRESSION_JOURNAL_WORKER_INTERVAL_MS"),
    );
    this.timer.unref();
    this.schedule();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private schedule() {
    if (!this.running)
      void observeWorker(this.prisma, "suppressionJournal", () => this.tick());
  }

  async tick(limit = 25) {
    if (this.running) return 0;
    this.running = true;
    let exported = 0;
    try {
      if (!(await workersMayMutate(this.prisma))) return 0;
      const now = new Date();
      await withWorkerWriteBarrier(this.prisma, (tx) =>
        tx.suppressionJournalEntry.updateMany({
          where: { state: "PROCESSING", leaseUntil: { lt: now } },
          data: {
            state: "FAILED",
            leaseOwner: null,
            leaseUntil: null,
            nextAttemptAt: now,
            lastErrorCode: "JOURNAL_LEASE_EXPIRED",
          },
        }),
      );
      const due = await this.prisma.suppressionJournalEntry.findMany({
        where: {
          state: { in: ["PENDING", "FAILED"] },
          attempts: { lt: MAX_ATTEMPTS },
          nextAttemptAt: { lte: now },
        },
        orderBy: { sequence: "asc" },
        take: Math.min(100, Math.max(1, limit)),
      });
      for (const candidate of due) {
        if (!(await workersMayMutate(this.prisma))) break;
        const { claimed, version } = await withWorkerWriteBarrier(
          this.prisma,
          async (tx, version) => ({
            version,
            claimed: await tx.suppressionJournalEntry.updateMany({
              where: {
                id: candidate.id,
                state: { in: ["PENDING", "FAILED"] },
                attempts: { lt: MAX_ATTEMPTS },
                nextAttemptAt: { lte: new Date() },
              },
              data: {
                state: "PROCESSING",
                attempts: { increment: 1 },
                leaseOwner: this.owner,
                leaseUntil: new Date(Date.now() + LEASE_MS),
                lastErrorCode: null,
              },
            }),
          }),
        );
        if (!claimed.count) continue;
        try {
          await this.export(candidate.id, version);
          exported += 1;
        } catch (error) {
          if (
            error instanceof ApiException &&
            error.code === "RECOVERY_WRITE_BARRIER_ACTIVE"
          )
            break;
          if (error instanceof Error && error.message === "JOURNAL_LEASE_LOST")
            continue;
          const code = this.safeError(error);
          const attempts = candidate.attempts + 1;
          await withWorkerWriteBarrier(
            this.prisma,
            (tx) =>
              tx.suppressionJournalEntry.updateMany({
                where: {
                  id: candidate.id,
                  state: "PROCESSING",
                  leaseOwner: this.owner,
                  leaseUntil: { gt: new Date() },
                },
                data: {
                  state: "FAILED",
                  leaseOwner: null,
                  leaseUntil: null,
                  lastErrorCode: code,
                  nextAttemptAt: new Date(
                    Date.now() + Math.min(3_600_000, 5_000 * 2 ** attempts),
                  ),
                },
              }),
            version,
          );
        }
      }
      return exported;
    } catch (error) {
      if (
        error instanceof ApiException &&
        error.code === "RECOVERY_WRITE_BARRIER_ACTIVE"
      )
        return exported;
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async export(id: string, version: number) {
    const entry = await this.prisma.suppressionJournalEntry.findUnique({
      where: { id },
    });
    if (
      !entry ||
      entry.state !== "PROCESSING" ||
      entry.leaseOwner !== this.owner ||
      !entry.leaseUntil ||
      entry.leaseUntil <= new Date()
    )
      throw new Error("JOURNAL_LEASE_LOST");
    const payload = entry.payload as Record<string, unknown>;
    const occurredAt = String(payload.occurredAt);
    const envelope: JournalEnvelope = {
      entryId: entry.id,
      sequence: entry.sequence,
      previousHash: entry.previousHash,
      payloadHash: entry.payloadHash,
      entryHash: entry.entryHash,
      occurredAt,
      keyVersion: this.config.get("SUPPRESSION_JOURNAL_KEY_VERSION"),
      payload,
    };
    const signed = {
      ...envelope,
      signature: signJournalEnvelope(
        envelope,
        this.config.get("SUPPRESSION_JOURNAL_HMAC_SECRET"),
      ),
    };
    const body = Buffer.from(JSON.stringify(signed));
    const storageRef = `entries/${String(entry.sequence).padStart(12, "0")}-${entry.entryHash}.json`;
    const renew = () =>
      withWorkerWriteBarrier(
        this.prisma,
        async (tx) => {
          const renewed = await tx.suppressionJournalEntry.updateMany({
            where: {
              id,
              state: "PROCESSING",
              leaseOwner: this.owner,
              leaseUntil: { gt: new Date() },
            },
            data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
          });
          if (renewed.count !== 1) throw new Error("JOURNAL_LEASE_LOST");
        },
        version,
      );
    await withRenewingLease(LEASE_MS, renew, async () => {
      try {
        await this.storage.putSuppressionJournal(storageRef, body);
      } catch (error) {
        if (!this.preconditionFailed(error)) throw error;
        const existing = await this.read(
          this.storage.getSuppressionJournal(storageRef),
        );
        if (!existing.equals(body)) throw new Error("JOURNAL_APPEND_CONFLICT");
      }
    });
    const updated = await withWorkerWriteBarrier(
      this.prisma,
      (tx) =>
        tx.suppressionJournalEntry.updateMany({
          where: {
            id,
            state: "PROCESSING",
            leaseOwner: this.owner,
            leaseUntil: { gt: new Date() },
          },
          data: {
            state: "EXPORTED",
            signature: signed.signature,
            keyVersion: signed.keyVersion,
            storageRef,
            exportedAt: new Date(),
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: null,
          },
        }),
      version,
    );
    if (!updated.count) throw new Error("JOURNAL_LEASE_LOST");
  }

  private async read(streamPromise: Promise<Readable>) {
    const stream = await streamPromise;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > 1_048_576) {
        stream.destroy();
        throw new Error("JOURNAL_OBJECT_TOO_LARGE");
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }

  private preconditionFailed(error: unknown) {
    const candidate = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return (
      candidate.name === "PreconditionFailed" ||
      candidate.$metadata?.httpStatusCode === 412
    );
  }

  private safeError(error: unknown) {
    if (error instanceof Error && /^[A-Z0-9_]{3,100}$/.test(error.message))
      return error.message;
    return "JOURNAL_EXPORT_FAILED";
  }
}
