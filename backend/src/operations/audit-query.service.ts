import { Injectable, Optional } from "@nestjs/common";

import type { AuthUser } from "../auth/auth-user";
import { AuditService, auditHash } from "../auth/audit.service";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import type { AuditQuery } from "./audit.schemas";
import { S3Storage } from "../storage/s3.storage";

const privateFields = {
  id: true,
  actorId: true,
  subjectId: true,
  actorType: true,
  actorRole: true,
  accessScope: true,
  module: true,
  action: true,
  resource: true,
  objectType: true,
  objectId: true,
  result: true,
  reason: true,
  correlationId: true,
  policyVersion: true,
  batchId: true,
  jobId: true,
  sedeId: true,
  areaId: true,
  occurredAt: true,
} as const;

const selfFields = {
  id: true,
  module: true,
  action: true,
  objectType: true,
  objectId: true,
  result: true,
  correlationId: true,
  occurredAt: true,
} as const;

function csvCell(value: unknown): string {
  const text =
    value instanceof Date ? value.toISOString() : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function utcRange(periodKey: string) {
  const from = new Date(`${periodKey}T00:00:00.000Z`);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

@Injectable()
export class AuditQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly storage?: S3Storage,
  ) {}

  async list(actor: AuthUser, query: AuditQuery, selfOnly: boolean) {
    const permission = selfOnly
      ? Permission.AUDIT_SELF_READ
      : Permission.AUDIT_READ;
    const where = this.whereFor(actor, permission, query, selfOnly);
    const take = query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * take,
        take,
        select: selfOnly ? selfFields : privateFields,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    await this.audit.append({
      actorId: actor.id,
      actorRole: actor.rol,
      subjectId: selfOnly ? actor.id : undefined,
      action: selfOnly ? "SELF_READ" : "READ",
      resource: "audit",
      module: "AUDIT",
      objectType: "AUDIT_EVENT",
      result: "SUCCESS",
      sedeId: actor.sedeId ?? undefined,
      areaId: actor.areaId ?? undefined,
      metadata: { page: query.page, pageSize: take, count: items.length },
    });
    return { items, page: query.page, pageSize: take, total };
  }

  async export(actor: AuthUser, query: AuditQuery) {
    const where = this.whereFor(actor, Permission.AUDIT_EXPORT, query, false);
    const items = await this.prisma.auditEvent.findMany({
      where,
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: 10_000,
      select: privateFields,
    });
    const columns = Object.keys(
      privateFields,
    ) as (keyof (typeof items)[number])[];
    const body = [
      columns.join(","),
      ...items.map((item) =>
        columns.map((key) => csvCell(item[key])).join(","),
      ),
    ].join("\r\n");
    await this.audit.append({
      actorId: actor.id,
      actorRole: actor.rol,
      action: "EXPORT",
      resource: "audit",
      module: "AUDIT",
      objectType: "AUDIT_EVENT",
      result: "SUCCESS",
      sedeId: actor.sedeId ?? undefined,
      areaId: actor.areaId ?? undefined,
      metadata: { count: items.length, capped: items.length === 10_000 },
    });
    return body;
  }

  async createManifest(actor: AuthUser, periodKey: string) {
    if (getAccessScope(actor, Permission.AUDIT_EXPORT) !== AccessScope.GLOBAL)
      throw new ApiException("FORBIDDEN", 403);
    const manifest = await this.buildManifest(periodKey);
    await this.audit.append({
      actorId: actor.id,
      actorRole: actor.rol,
      action: "MANIFEST_CREATE",
      resource: "audit-manifest",
      module: "AUDIT",
      objectType: "AUDIT_MANIFEST",
      objectId: periodKey,
      result: "SUCCESS",
      metadata: { count: manifest.eventCount },
    });
    return manifest;
  }

  async createSystemManifest(periodKey: string) {
    const existing = await this.prisma.auditManifest.findUnique({
      where: { periodKey },
    });
    if (existing) {
      const verification = await this.verifyManifest(null, periodKey);
      if (!verification.valid)
        throw new ApiException("AUDIT_INTEGRITY_CHECK_FAILED", 409, {
          issues: verification.issues,
        });
      return {
        ...existing,
        assurance: "integrity-check-not-legal-signature",
      };
    }
    const manifest = await this.buildManifest(periodKey);
    await this.audit.append({
      actorType: "SYSTEM",
      action: "MANIFEST_CREATE",
      resource: "audit-manifest",
      module: "AUDIT",
      objectType: "AUDIT_MANIFEST",
      objectId: periodKey,
      result: "SUCCESS",
      metadata: { count: manifest.eventCount },
    });
    return manifest;
  }

  private async buildManifest(periodKey: string) {
    if (periodKey >= new Date().toISOString().slice(0, 10))
      throw new ApiException("AUDIT_PERIOD_NOT_CLOSED", 409);
    const existing = await this.prisma.auditManifest.findUnique({
      where: { periodKey },
    });
    if (existing) {
      const verification = await this.verifyManifest(null, periodKey);
      if (!verification.valid)
        throw new ApiException("AUDIT_INTEGRITY_CHECK_FAILED", 409, {
          issues: verification.issues,
        });
      throw new ApiException("AUDIT_MANIFEST_EXISTS", 409);
    }
    const events = await this.integrityEvents(periodKey);
    const range = utcRange(periodKey);
    const unchained = await this.prisma.auditEvent.count({
      where: {
        periodKey: null,
        occurredAt: { gte: range.from, lt: range.to },
      },
    });
    if (unchained > 0)
      throw new ApiException("AUDIT_PERIOD_HAS_UNCHAINED_EVENTS", 409, {
        count: unchained,
      });
    const manifestPayload = {
      periodKey,
      eventCount: events.length,
      firstHash: events.at(0)?.eventHash ?? null,
      lastHash: events.at(-1)?.eventHash ?? null,
    };
    const manifestHash = auditHash(manifestPayload);
    const storageRef = `audit-manifests/${periodKey}/${manifestHash}.json`;
    if (this.storage)
      await this.storage.put(
        "available",
        storageRef,
        Buffer.from(JSON.stringify({ ...manifestPayload, manifestHash })),
        "application/json",
      );
    const manifest = await this.prisma.auditManifest.create({
      data: {
        ...manifestPayload,
        manifestHash,
        storageRef: this.storage ? storageRef : null,
      },
    });
    return { ...manifest, assurance: "integrity-check-not-legal-signature" };
  }

  async verifyManifest(actor: AuthUser | null, periodKey: string) {
    const range = utcRange(periodKey);
    const [manifest, events, unchained] = await Promise.all([
      this.prisma.auditManifest.findUnique({ where: { periodKey } }),
      this.integrityEvents(periodKey),
      this.prisma.auditEvent.count({
        where: {
          periodKey: null,
          occurredAt: { gte: range.from, lt: range.to },
        },
      }),
    ]);
    const issues: string[] = [];
    if (unchained > 0) issues.push(`unchained-events:${unchained}`);
    let previousHash: string | null = null;
    for (const [offset, event] of events.entries()) {
      const expectedIndex = offset + 1;
      if (event.chainIndex !== expectedIndex)
        issues.push(`missing-index:${expectedIndex}`);
      if (event.previousHash !== previousHash)
        issues.push(`previous-hash:${event.id}`);
      const { eventHash, id: _id, ...payload } = event;
      if (eventHash !== auditHash(payload))
        issues.push(`event-hash:${event.id}`);
      previousHash = eventHash;
    }
    if (!manifest) issues.push("manifest-missing");
    else {
      const expected = auditHash({
        periodKey,
        eventCount: events.length,
        firstHash: events.at(0)?.eventHash ?? null,
        lastHash: events.at(-1)?.eventHash ?? null,
      });
      if (manifest.eventCount !== events.length) issues.push("event-count");
      if (manifest.firstHash !== (events.at(0)?.eventHash ?? null))
        issues.push("first-hash");
      if (manifest.lastHash !== (events.at(-1)?.eventHash ?? null))
        issues.push("last-hash");
      if (manifest.manifestHash !== expected) issues.push("manifest-hash");
      if (manifest.storageRef && this.storage) {
        try {
          const body = await this.storage.get("available", manifest.storageRef);
          const chunks: Buffer[] = [];
          for await (const chunk of body)
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          const stored = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (
            stored.manifestHash !== manifest.manifestHash ||
            auditHash({
              periodKey: stored.periodKey,
              eventCount: stored.eventCount,
              firstHash: stored.firstHash,
              lastHash: stored.lastHash,
            }) !== stored.manifestHash
          )
            issues.push("private-manifest-hash");
        } catch {
          issues.push("private-manifest-unavailable");
        }
      }
      if (issues.length === 0)
        await this.prisma.auditManifest.update({
          where: { periodKey },
          data: { verifiedAt: new Date() },
        });
    }
    if (actor)
      await this.audit.append({
        actorId: actor.id,
        actorRole: actor.rol,
        action: "MANIFEST_VERIFY",
        resource: "audit-manifest",
        module: "AUDIT",
        objectType: "AUDIT_MANIFEST",
        objectId: periodKey,
        result: issues.length ? "FAILED" : "SUCCESS",
        metadata: { count: events.length, issueCount: issues.length },
      });
    return {
      periodKey,
      valid: issues.length === 0,
      issues,
      eventCount: events.length,
      assurance: "integrity-check-not-legal-signature",
    };
  }

  private integrityEvents(periodKey: string) {
    return this.prisma.auditEvent.findMany({
      where: { periodKey },
      orderBy: { chainIndex: "asc" },
      select: {
        id: true,
        actorId: true,
        subjectId: true,
        action: true,
        resource: true,
        correlationId: true,
        metadata: true,
        actorType: true,
        actorRole: true,
        accessScope: true,
        module: true,
        objectType: true,
        objectId: true,
        result: true,
        reason: true,
        diff: true,
        policyVersion: true,
        batchId: true,
        jobId: true,
        sedeId: true,
        areaId: true,
        periodKey: true,
        chainIndex: true,
        previousHash: true,
        eventHash: true,
        occurredAt: true,
      },
    });
  }

  private whereFor(
    actor: AuthUser,
    permission: Permission,
    query: AuditQuery,
    selfOnly: boolean,
  ): Prisma.AuditEventWhereInput {
    const scope = getAccessScope(actor, permission);
    if (!scope) throw new ApiException("FORBIDDEN", 403);
    const where: Prisma.AuditEventWhereInput = {
      occurredAt: {
        gte: query.from,
        lte: query.to,
      },
      module: query.module,
      action: query.action,
      objectType: query.objectType,
      objectId: query.objectId,
      result: query.result,
      correlationId: query.correlationId,
    };
    if (selfOnly || scope === AccessScope.SELF) {
      where.OR = [{ actorId: actor.id }, { subjectId: actor.id }];
      return where;
    }
    if (scope === AccessScope.AREA) {
      if (actor.areaId === null) throw new ApiException("FORBIDDEN", 403);
      where.areaId = actor.areaId;
    } else if (scope === AccessScope.SEDE) {
      if (actor.sedeId === null) throw new ApiException("FORBIDDEN", 403);
      where.sedeId = actor.sedeId;
    }
    where.actorId = query.actorId;
    where.subjectId = query.subjectId;
    if (scope === AccessScope.GLOBAL) {
      where.sedeId = query.sedeId;
      where.areaId = query.areaId;
    }
    return where;
  }
}
