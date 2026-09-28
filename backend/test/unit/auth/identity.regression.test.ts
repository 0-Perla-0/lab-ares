import { describe, expect, it, vi } from "vitest";
import { PrismaSessionStore } from "../../../src/auth/prisma-session.store";
import { AuditService } from "../../../src/auth/audit.service";
import { OutboxService } from "../../../src/auth/outbox.service";

const sessionValue = () => ({ cookie: { expires: new Date(Date.now() + 3_600_000), maxAge: 3_600_000 }, userId: 9 } as any);

describe("identity regression boundaries", () => {
  it("hides revoked sessions", async () => {
    const db = { session: { findUnique: vi.fn().mockResolvedValue({ data: sessionValue(), expiresAt: new Date(Date.now()+10000), absoluteExpiresAt: new Date(Date.now()+10000), lastActivityAt: new Date(), revokedAt: new Date() }), deleteMany: vi.fn() } };
    const store = new PrismaSessionStore(db as any);
    await new Promise<void>((resolve) => store.get("sid", (_e, value) => { expect(value).toBeNull(); resolve(); }));
  });
  it("hides sessions past the absolute deadline", async () => {
    const db = { session: { findUnique: vi.fn().mockResolvedValue({ data: sessionValue(), expiresAt: new Date(Date.now()+10000), absoluteExpiresAt: new Date(Date.now()-1), lastActivityAt: new Date(), revokedAt: null }), deleteMany: vi.fn() } };
    const store = new PrismaSessionStore(db as any);
    await new Promise<void>((resolve) => store.get("sid", (_e, value) => { expect(value).toBeNull(); resolve(); }));
  });
  it("hides idle sessions", async () => {
    const db = { session: { findUnique: vi.fn().mockResolvedValue({ data: sessionValue(), expiresAt: new Date(Date.now()+10000), absoluteExpiresAt: new Date(Date.now()+10000), lastActivityAt: new Date(Date.now()-31*60_000), revokedAt: null }), deleteMany: vi.fn() } };
    const store = new PrismaSessionStore(db as any);
    await new Promise<void>((resolve) => store.get("sid", (_e, value) => { expect(value).toBeNull(); resolve(); }));
  });
  it("does not touch a session within the throttle window", async () => {
    const db = { session: { findUnique: vi.fn().mockResolvedValue({ lastActivityAt: new Date(), absoluteExpiresAt: new Date(Date.now()+10000), revokedAt: null }), updateMany: vi.fn() } };
    const store = new PrismaSessionStore(db as any);
    await new Promise<void>((resolve) => store.touch("sid", sessionValue(), () => { expect(db.session.updateMany).not.toHaveBeenCalled(); resolve(); }));
  });
  it("records audit metadata without plaintext token fields", async () => {
    const create = vi.fn().mockResolvedValue({});
    const service = new AuditService({ auditEvent: { create } } as any);
    await service.append({ actorId: 1, action: "RECOVERY_REQUESTED", resource: "identity", metadata: { accepted: true } });
    expect(create.mock.calls[0][0].data.metadata).not.toHaveProperty("token");
  });
  it("does not mutate an existing audit event", async () => {
    const db = { auditEvent: { create: vi.fn().mockResolvedValue({ id: "a" }), update: vi.fn(), delete: vi.fn() } };
    const service = new AuditService(db as any);
    await service.append({ action: "X", resource: "r" });
    expect(db.auditEvent.update).not.toHaveBeenCalled();
    expect(db.auditEvent.delete).not.toHaveBeenCalled();
  });
  it("outbox rollback is delegated to the transaction client", async () => {
    const tx = { outboxEvent: { create: vi.fn().mockRejectedValue(new Error("rollback")) } };
    const service = new OutboxService({ outboxEvent: { create: vi.fn() } } as any, { get: vi.fn((k: string) => k === "OUTBOX_ENCRYPTION_KEY" ? "test-outbox-encryption-key-32-characters" : "test") } as any);
    await expect(service.enqueue({ type: "X", aggregateId: "1", payload: {} }, tx)).rejects.toThrow("rollback");
  });
  it("supports transaction clients for audit", async () => {
    const tx = { auditEvent: { create: vi.fn().mockResolvedValue({ id: "x" }) } };
    await new AuditService({ auditEvent: { create: vi.fn() } } as any).append({ action: "X", resource: "r" }, tx);
    expect(tx.auditEvent.create).toHaveBeenCalledOnce();
  });
});
