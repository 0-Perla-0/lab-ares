import { describe, expect, it, vi } from "vitest";

import { AuditService } from "../../../src/auth/audit.service";
import { AuditQueryService } from "../../../src/operations/audit-query.service";
import { RolUsuario } from "../../../src/generated/prisma/enums";
import { Prisma } from "../../../src/generated/prisma/client";

function memoryPrisma() {
  const events: Record<string, any>[] = [];
  let manifest: Record<string, any> | null = null;
  const auditEvent = {
    findFirst: vi.fn(async ({ where }: any) => {
      const matches = events.filter(
        (event) => event.periodKey === where.periodKey,
      );
      return matches.at(-1) ?? null;
    }),
    create: vi.fn(async ({ data }: any) => {
      const event = {
        id: `event-${events.length + 1}`,
        ...data,
        metadata: data.metadata === Prisma.JsonNull ? null : data.metadata,
        diff: data.diff === Prisma.JsonNull ? null : data.diff,
      };
      events.push(event);
      return event;
    }),
    findMany: vi.fn(async ({ where }: any) =>
      events
        .filter((event) => event.periodKey === where.periodKey)
        .sort((left, right) => left.chainIndex - right.chainIndex),
    ),
    count: vi.fn(async ({ where }: any = {}) =>
      where?.periodKey === null
        ? events.filter((event) => event.periodKey === null).length
        : events.length,
    ),
  };
  const auditManifest = {
    findUnique: vi.fn(async () => manifest),
    create: vi.fn(async ({ data }: any) => {
      manifest = { id: "manifest-1", createdAt: new Date(), ...data };
      return manifest;
    }),
    update: vi.fn(async ({ data }: any) => {
      manifest = { ...manifest, ...data };
      return manifest;
    }),
  };
  const prisma: any = {
    auditEvent,
    auditManifest,
    $transaction: vi.fn((value: any) =>
      typeof value === "function" ? value(prisma) : Promise.all(value),
    ),
  };
  return {
    prisma,
    events,
    get manifest() {
      return manifest;
    },
  };
}

const admin = {
  id: 1,
  codigo: "ADMIN001",
  email: "admin@example.com",
  rol: RolUsuario.ADMIN,
  estado: "ACTIVA" as const,
  sedeId: 1,
  areaId: 2,
  turnoId: null,
};

describe("audit integrity", () => {
  it("builds a deterministic chain, redacts secrets, and detects tampering or loss", async () => {
    const memory = memoryPrisma();
    const audit = new AuditService(memory.prisma, {
      getId: () => "request-12345678",
    } as any);
    const occurredAt = new Date("2026-09-26T10:00:00.000Z");
    await audit.append({
      actorId: 1,
      action: "CREATE",
      resource: "users",
      occurredAt,
      metadata: { count: 1, password: "must-not-survive" },
      diff: { before: { state: "A" }, privateField: "drop" },
    });
    expect(memory.prisma.$transaction).toHaveBeenCalled();
    await audit.append({
      actorId: 1,
      action: "UPDATE",
      resource: "users",
      occurredAt,
    });

    expect(memory.events[0]).toMatchObject({
      chainIndex: 1,
      previousHash: null,
      correlationId: "request-12345678",
      metadata: { count: 1 },
      diff: { before: { state: "A" } },
    });
    expect(memory.events[1].previousHash).toBe(memory.events[0].eventHash);

    const queries = new AuditQueryService(memory.prisma, audit);
    await queries.createManifest(admin as any, "2026-09-26");
    await expect(
      queries.createManifest(admin as any, "2026-09-26"),
    ).rejects.toMatchObject({ code: "AUDIT_MANIFEST_EXISTS" });
    await expect(
      queries.createManifest(
        { ...admin, rol: RolUsuario.JEFE_AREA } as any,
        "2026-09-26",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await queries.verifyManifest(null, "2026-09-26")).toMatchObject({
      valid: true,
      assurance: "integrity-check-not-legal-signature",
    });

    memory.events[1].action = "TAMPERED";
    const tampered = await queries.verifyManifest(null, "2026-09-26");
    expect(tampered.valid).toBe(false);
    expect(tampered.issues).toContain(`event-hash:${memory.events[1].id}`);

    memory.events.shift();
    const missing = await queries.verifyManifest(null, "2026-09-26");
    expect(missing.issues).toContain("missing-index:1");
    expect(missing.issues).toContain("event-count");
  });

  it("forces self scope and audits list/export access", async () => {
    const findMany = vi.fn(async () => []);
    const count = vi.fn(async () => 0);
    const append = vi.fn(async () => ({}));
    const prisma: any = {
      auditEvent: { findMany, count },
      $transaction: (values: Promise<unknown>[]) => Promise.all(values),
    };
    const service = new AuditQueryService(prisma, { append } as any);
    await service.list(
      admin as any,
      { page: 1, pageSize: 25, actorId: 999 } as any,
      true,
    );
    expect((findMany.mock.calls as any)[0][0].where).toMatchObject({
      OR: [{ actorId: 1 }, { subjectId: 1 }],
    });
    expect((findMany.mock.calls as any)[0][0].where.actorId).toBeUndefined();
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SELF_READ" }),
    );

    await service.export(admin as any, { page: 1, pageSize: 25 } as any);
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EXPORT" }),
    );

    findMany.mockClear();
    await service.list(
      { ...admin, rol: RolUsuario.JEFE_AREA, areaId: 7 } as any,
      { page: 1, pageSize: 25, areaId: 999, sedeId: 999 } as any,
      false,
    );
    expect((findMany.mock.calls as any)[0][0].where).toMatchObject({
      areaId: 7,
    });
  });
});
