import { createHash } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";

import { CorrelationContext } from "../common/http/correlation-context";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

export type AuditActorType = "HUMAN" | "SYSTEM";
export type AuditResult = "SUCCESS" | "DENIED" | "FAILED";

export interface AuditInput {
  actorId?: number;
  subjectId?: number;
  action: string;
  resource: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  actorType?: AuditActorType;
  actorRole?: string;
  accessScope?: string;
  module?: string;
  objectType?: string;
  objectId?: string;
  result?: AuditResult;
  reason?: string;
  diff?: Record<string, unknown>;
  policyVersion?: string;
  batchId?: string;
  jobId?: string;
  sedeId?: number;
  areaId?: number;
  occurredAt?: Date;
}

const forbiddenKeyMarkers = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "objectkey",
  "quarantinekey",
  "credential",
  "email",
  "correo",
  "phone",
  "telefono",
  "address",
  "direccion",
];

function isForbiddenKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return forbiddenKeyMarkers.some(
    (marker) =>
      normalized === marker ||
      normalized.startsWith(marker) ||
      normalized.endsWith(marker),
  );
}
const diffAllowlist = new Set([
  "before",
  "after",
  "fields",
  "state",
  "count",
  "code",
]);

function cleanValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => cleanValue(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !isForbiddenKey(key))
        .map(([key, item]) => [key, cleanValue(item, depth + 1)]),
    );
  if (typeof value === "string")
    return /(password|secret|token|authorization|cookie|credential|bearer)\s*[:= ]/i.test(
      value,
    )
      ? "[REDACTED]"
      : value.slice(0, 2000);
  return value;
}

export function sanitizeAuditData(
  value: Record<string, unknown> | undefined,
  allowlist?: Set<string>,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) => !isForbiddenKey(key) && (!allowlist || allowlist.has(key)),
      )
      .map(([key, item]) => [key, cleanValue(item)]),
  );
}

function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

export function auditHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function utcPeriod(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly correlation?: CorrelationContext,
  ) {}

  async append(input: AuditInput, client?: any) {
    if (client) return this.appendWithClient(input, client);
    if (typeof (this.prisma as any).$transaction !== "function")
      return this.appendWithClient(input, this.prisma);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (transaction) => this.appendWithClient(input, transaction),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2002", "P2034"].includes(error.code);
        if (!retryable || attempt === 3) throw error;
      }
    }
    throw new Error("Audit append retry exhausted");
  }

  private async appendWithClient(input: AuditInput, client: any) {
    const occurredAt = input.occurredAt ?? new Date();
    const periodKey = utcPeriod(occurredAt);
    const head = client.auditChainHead?.upsert
      ? await client.auditChainHead.upsert({
          where: { periodKey },
          create: { periodKey, lastIndex: 0 },
          update: { updatedAt: new Date() },
          select: { lastIndex: true, lastHash: true },
        })
      : null;
    const previous =
      !head && client.auditEvent.findFirst
        ? await client.auditEvent.findFirst({
            where: { periodKey },
            orderBy: [{ chainIndex: "desc" }, { occurredAt: "desc" }],
            select: { chainIndex: true, eventHash: true },
          })
        : null;
    const chainIndex = (head?.lastIndex ?? previous?.chainIndex ?? 0) + 1;
    const previousHash = head?.lastHash ?? previous?.eventHash ?? null;
    const metadata = sanitizeAuditData(input.metadata);
    const diff = sanitizeAuditData(input.diff, diffAllowlist);
    const payload = {
      actorId: input.actorId ?? null,
      subjectId: input.subjectId ?? null,
      action: input.action,
      resource: input.resource,
      correlationId: input.correlationId ?? this.correlation?.getId() ?? null,
      metadata: metadata ?? null,
      actorType: input.actorType ?? "HUMAN",
      actorRole: input.actorRole ?? null,
      accessScope: input.accessScope ?? null,
      module: input.module ?? input.resource,
      objectType: input.objectType ?? input.resource,
      objectId: input.objectId ?? null,
      result: input.result ?? "SUCCESS",
      reason: input.reason
        ? /(password|secret|token|authorization|cookie|credential)\s*[:=]/i.test(
            input.reason,
          )
          ? "[REDACTED]"
          : input.reason.slice(0, 500)
        : null,
      diff: diff ?? null,
      policyVersion: input.policyVersion ?? null,
      batchId: input.batchId ?? null,
      jobId: input.jobId ?? null,
      sedeId: input.sedeId ?? null,
      areaId: input.areaId ?? null,
      periodKey,
      chainIndex,
      previousHash,
      occurredAt,
    };
    const eventHash = auditHash(payload);
    const created = await client.auditEvent.create({
      data: {
        ...payload,
        metadata: metadata as Prisma.InputJsonValue | undefined,
        diff: diff as Prisma.InputJsonValue | undefined,
        eventHash,
      },
    });
    if (client.auditChainHead?.update)
      await client.auditChainHead.update({
        where: { periodKey },
        data: { lastIndex: chainIndex, lastHash: eventHash },
      });
    return created;
  }
}
