import { describe, expect, it, vi } from "vitest";
import { OutboxService } from "../../../src/auth/outbox.service";
import { IdentityCleanupService } from "../../../src/auth/identity-cleanup.service";

function config(value = "test-outbox-encryption-key-32-characters") {
  return { get: vi.fn((key: string) => key === "OUTBOX_ENCRYPTION_KEY" ? value : "test") } as any;
}

describe("identity security boundaries", () => {
  it("encrypts outbox payloads", async () => {
    const create = vi.fn().mockResolvedValue({ id: "evt" });
    const service = new OutboxService({ outboxEvent: { create } } as any, config());
    await service.enqueue({ type: "MAIL", aggregateId: "1", payload: { token: "secret" } });
    const payload = create.mock.calls[0][0].data.payload;
    expect(payload).not.toHaveProperty("token");
    expect(payload.alg).toBe("A256GCM");
  });

  it("decrypts only authenticated encrypted payloads", async () => {
    const create = vi.fn().mockResolvedValue({});
    const service = new OutboxService({ outboxEvent: { create } } as any, config());
    await service.enqueue({ type: "MAIL", aggregateId: "1", payload: { token: "secret" } });
    const payload = create.mock.calls[0][0].data.payload;
    expect(service.decryptPayload(payload)).toEqual({ token: "secret" });
    expect(() => service.decryptPayload({ ...payload, tag: "bad" })).toThrow();
  });

  it("rejects malformed encrypted payloads", () => {
    const service = new OutboxService({ outboxEvent: { create: vi.fn() } } as any, config());
    expect(() => service.decryptPayload({ alg: "plain" })).toThrow();
  });

  it("rejects a missing key", () => {
    expect(() => new OutboxService({ outboxEvent: { create: vi.fn() } } as any, config(""))).toThrow();
  });

  it("rejects the production placeholder", () => {
    const c = { get: vi.fn((key: string) => key === "OUTBOX_ENCRYPTION_KEY" ? "development-only-key" : "production") } as any;
    expect(() => new OutboxService({ outboxEvent: { create: vi.fn() } } as any, c)).toThrow();
  });

  it("does not overlap cleanup runs", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => { resolve = r; });
    const prisma = { $transaction: vi.fn().mockReturnValue(pending), invitation: { updateMany: vi.fn() }, recoveryToken: { deleteMany: vi.fn() }, session: { deleteMany: vi.fn() } };
    const service = new IdentityCleanupService(prisma as any);
    const first = service.run();
    const second = await service.run();
    expect(second).toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    resolve();
    await first;
  });

  it("runs cleanup transaction with expiry and revocation predicates", async () => {
    const prisma = { $transaction: vi.fn().mockResolvedValue([]), invitation: { updateMany: vi.fn() }, recoveryToken: { deleteMany: vi.fn() }, session: { deleteMany: vi.fn() } };
    const service = new IdentityCleanupService(prisma as any);
    await service.run(new Date("2026-01-01T00:00:00Z"));
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.invitation.updateMany).toHaveBeenCalledOnce();
    expect(prisma.invitation.updateMany.mock.calls[0][0].data).toEqual({ archivedAt: new Date("2026-01-01T00:00:00Z") });
    expect(prisma.recoveryToken.deleteMany).toHaveBeenCalled();
    expect(prisma.session.deleteMany).toHaveBeenCalled();
  });

  it("cleans up again after a prior run completes", async () => {
    const prisma = { $transaction: vi.fn().mockResolvedValue([]), invitation: { updateMany: vi.fn() }, recoveryToken: { deleteMany: vi.fn() }, session: { deleteMany: vi.fn() } };
    const service = new IdentityCleanupService(prisma as any);
    await service.run();
    await service.run();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("archives only invitations outside the retention window", async () => {
    const prisma = { $transaction: vi.fn().mockResolvedValue([]), invitation: { updateMany: vi.fn() }, recoveryToken: { deleteMany: vi.fn() }, session: { deleteMany: vi.fn() } };
    const service = new IdentityCleanupService(prisma as any);
    const now = new Date("2026-01-31T00:00:00Z");
    await service.run(now, 7);
    const where = prisma.invitation.updateMany.mock.calls[0][0].where;
    expect(where.archivedAt).toBeNull();
    expect(where.OR).toHaveLength(3);
    expect(where.OR[0].usedAt.lt).toEqual(new Date("2026-01-24T00:00:00Z"));
  });

  it("keeps invitation cleanup non-destructive even when no retention is configured", async () => {
    const prisma = { $transaction: vi.fn().mockResolvedValue([]), invitation: { updateMany: vi.fn() }, recoveryToken: { deleteMany: vi.fn() }, session: { deleteMany: vi.fn() } };
    const service = new IdentityCleanupService(prisma as any);
    await service.run(new Date("2026-01-01T00:00:00Z"), 0);
    expect(prisma.invitation.updateMany).toHaveBeenCalledOnce();
    expect((prisma.invitation as any).deleteMany).toBeUndefined();
  });
});
