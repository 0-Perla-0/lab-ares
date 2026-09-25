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
}
