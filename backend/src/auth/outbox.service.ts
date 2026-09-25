import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database/prisma.service";
import type { Environment } from "../config/environment";

export interface DeliveryEvent { type: string; aggregateId: string; payload: Record<string, unknown>; }

@Injectable()
export class OutboxService {
  private readonly key: Buffer;
  constructor(private readonly prisma: PrismaService, config: ConfigService<Environment, true>) {
    const configured = config.get("OUTBOX_ENCRYPTION_KEY", { infer: true });
    if (!configured || (config.get("NODE_ENV", { infer: true }) === "production" && configured.includes("development-only"))) throw new Error("OUTBOX_ENCRYPTION_KEY must be configured");
    this.key = createHash("sha256").update(configured).digest();
  }
  decryptPayload(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== "object") throw new Error("Invalid encrypted outbox payload");
    const value = payload as Record<string, unknown>;
    if (value.alg !== "A256GCM" || typeof value.iv !== "string" || typeof value.tag !== "string" || typeof value.ciphertext !== "string") throw new Error("Invalid encrypted outbox payload");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(value.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64url")), decipher.final()]).toString("utf8")) as Record<string, unknown>;
  }
  async enqueue(event: DeliveryEvent, client: any = this.prisma) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(event.payload), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return client.outboxEvent.create({ data: { type: event.type, aggregateId: event.aggregateId, payload: { alg: "A256GCM", iv: iv.toString("base64url"), tag: tag.toString("base64url"), ciphertext: ciphertext.toString("base64url") } } });
  }
  async claim(owner: string, now = new Date()) {
    const until = new Date(now.getTime() + 60_000);
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.outboxEvent.findFirst({ where: { OR: [{ state: "PENDING", nextAttemptAt: { lte: now } }, { state: "PROCESSING", leaseUntil: { lt: now } }], failedAt: null }, orderBy: { occurredAt: "asc" } });
      if (!candidate) return null;
      const claimed = await tx.outboxEvent.updateMany({ where: { id: candidate.id, OR: [{ state: "PENDING", nextAttemptAt: { lte: now } }, { state: "PROCESSING", leaseUntil: { lt: now } }] }, data: { state: "PROCESSING", leaseOwner: owner, leaseUntil: until, attempts: { increment: 1 } } });
      return claimed.count ? tx.outboxEvent.findUnique({ where: { id: candidate.id } }) : null;
    });
  }
  async markSent(id: string, owner: string) { return this.prisma.outboxEvent.updateMany({ where: { id, state: "PROCESSING", leaseOwner: owner }, data: { state: "SENT", processedAt: new Date(), leaseOwner: null, leaseUntil: null } }); }
  async markFailure(id: string, owner: string, error: string, maxAttempts = 5) { return this.prisma.$transaction(async tx => { const row = await tx.outboxEvent.findFirst({ where: { id, state: "PROCESSING", leaseOwner: owner }, select: { attempts: true } }); if (!row) return { count: 0 }; const permanent = row.attempts >= maxAttempts; return tx.outboxEvent.updateMany({ where: { id, state: "PROCESSING", leaseOwner: owner, attempts: row.attempts }, data: { state: permanent ? "FAILED" : "PENDING", failedAt: permanent ? new Date() : null, nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 1000 * 2 ** Math.max(0, row.attempts - 1))), lastError: error.slice(0, 500), leaseOwner: null, leaseUntil: null } }); }); }
}
