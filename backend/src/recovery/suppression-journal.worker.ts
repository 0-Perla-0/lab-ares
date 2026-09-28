import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { S3Storage } from "../storage/s3.storage";
import { workersMayMutate } from "./barrier";
import { type JournalEnvelope, signJournalEnvelope } from "./journal-integrity";

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
      () => void this.tick(),
      this.config.get("SUPPRESSION_JOURNAL_WORKER_INTERVAL_MS"),
    );
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(limit = 25) {
    if (this.running) return 0;
    this.running = true;
    try {
      if (!(await workersMayMutate(this.prisma))) return 0;
      const now = new Date();
      await this.prisma.suppressionJournalEntry.updateMany({
        where: { state: "PROCESSING", leaseUntil: { lt: now } },
        data: {
          state: "FAILED",
          leaseOwner: null,
          leaseUntil: null,
          nextAttemptAt: now,
          lastErrorCode: "JOURNAL_LEASE_EXPIRED",
        },
      });
      const due = await this.prisma.suppressionJournalEntry.findMany({
        where: {
          state: { in: ["PENDING", "FAILED"] },
          attempts: { lt: MAX_ATTEMPTS },
          nextAttemptAt: { lte: now },
        },
        orderBy: { sequence: "asc" },
        take: Math.min(100, Math.max(1, limit)),
      });
      let exported = 0;
      for (const candidate of due) {
        if (!(await workersMayMutate(this.prisma))) break;
        const claimed = await this.prisma.suppressionJournalEntry.updateMany({
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
        });
        if (!claimed.count) continue;
        try {
          await this.export(candidate.id);
          exported += 1;
        } catch (error) {
          const code = this.safeError(error);
          const attempts = candidate.attempts + 1;
          await this.prisma.suppressionJournalEntry.updateMany({
            where: {
              id: candidate.id,
              state: "PROCESSING",
              leaseOwner: this.owner,
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
          });
        }
      }
      return exported;
    } finally {
      this.running = false;
    }
  }

  private async export(id: string) {
    const entry = await this.prisma.suppressionJournalEntry.findUnique({
      where: { id },
    });
    if (
      !entry ||
      entry.state !== "PROCESSING" ||
      entry.leaseOwner !== this.owner
    )
      return;
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
    try {
      await this.storage.putSuppressionJournal(storageRef, body);
    } catch (error) {
      if (!this.preconditionFailed(error)) throw error;
      const existing = await this.read(
        this.storage.getSuppressionJournal(storageRef),
      );
      if (!existing.equals(body)) throw new Error("JOURNAL_APPEND_CONFLICT");
    }
    const updated = await this.prisma.suppressionJournalEntry.updateMany({
      where: { id, state: "PROCESSING", leaseOwner: this.owner },
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
    });
    if (!updated.count) throw new Error("JOURNAL_LEASE_LOST");
  }

  private async read(streamPromise: Promise<Readable>) {
    const stream = await streamPromise;
    const chunks: Buffer[] = [];
    for await (const chunk of stream)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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
