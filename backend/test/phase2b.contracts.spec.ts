import { describe, expect, it, vi } from "vitest";
import { NotificationsService } from "../src/notifications/notifications.service";
import { NotificationsController } from "../src/notifications/notifications.controller";
import { OutboxService } from "../src/auth/outbox.service";
import { EmailService } from "../src/auth/email.service";
import { validateEnvironment } from "../src/config/environment";
import { AuthController } from "../src/auth/auth.controller";
import { MfaService } from "../src/auth/mfa.service";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = (overrides: Record<string, unknown> = {}) => validateEnvironment({ DATABASE_URL: "mysql://u:p@localhost/db", NODE_ENV: "test", OUTBOX_ENCRYPTION_KEY: "test-outbox-encryption-key-32-characters", MFA_ENCRYPTION_KEY: "test-mfa-encryption-key-32-characters", ...overrides });

describe("Backend 2 real contracts", () => {
  it("scopes notifications to the authenticated user and paginates", async () => {
    const findMany = vi.fn().mockResolvedValue([]); const prisma: any = { notification: { findMany, updateMany: vi.fn() } };
    const service = new NotificationsService(prisma); await service.list(7, 2, 200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 7 }, skip: 100, take: 100 }));
    const controller = new NotificationsController(service); await controller.list({ user: { id: 7 } } as any, "1", "20"); expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { userId: 7 } }));
  });
  it("awaits scoped read and read-all writes", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 }); const service = new NotificationsService({ notification: { updateMany, findMany: vi.fn() } } as any);
    await service.read(3, "n1"); await service.readAll(3);
    expect(updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: "n1", userId: 3 } })); expect(updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { userId: 3, readAt: null } }));
  });
  it("claims an outbox event with an owner and lease", async () => {
    const row = { id: "e1", state: "PENDING", attempts: 0 }; const updateMany = vi.fn().mockResolvedValue({ count: 1 }); const findFirst = vi.fn().mockResolvedValue(row); const findUnique = vi.fn().mockResolvedValue({ ...row, state: "PROCESSING" });
    const tx: any = { outboxEvent: { findFirst, updateMany, findUnique } }; const prisma: any = { $transaction: (fn: any) => fn(tx) }; const service = new OutboxService(prisma, { get: (k: string) => k === "OUTBOX_ENCRYPTION_KEY" ? "test-outbox-encryption-key-32-characters" : "test" } as any);
    await service.claim("worker-a"); expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "e1" }), data: expect.objectContaining({ leaseOwner: "worker-a" }) }));
  });
  it("allows only one of two workers to claim the same event", async () => {
    let claimed = false; const row = { id: "e1", state: "PENDING", attempts: 0 }; const tx: any = { outboxEvent: { findFirst: vi.fn().mockResolvedValue(row), updateMany: vi.fn().mockImplementation(async () => { if (claimed) return { count: 0 }; claimed = true; return { count: 1 }; }), findUnique: vi.fn().mockResolvedValue(row) } }; const s = new OutboxService({ $transaction: (fn: any) => fn(tx) } as any, { get: () => "test-outbox-encryption-key-32-characters" } as any);
    const result = await Promise.all([s.claim("a"), s.claim("b")]); expect(result.filter(Boolean)).toHaveLength(1);
  });
  it("recovers a stale processing lease", async () => { const findFirst = vi.fn().mockResolvedValue({ id: "e", state: "PROCESSING", attempts: 1 }); const updateMany = vi.fn().mockResolvedValue({ count: 1 }); const tx: any = { outboxEvent: { findFirst, updateMany, findUnique: vi.fn().mockResolvedValue({ id: "e" }) } }; const s = new OutboxService({ $transaction: (f: any) => f(tx) } as any, { get: () => "test-outbox-encryption-key-32-characters" } as any); await s.claim("recover", new Date()); expect(findFirst.mock.calls[0][0].where.OR[1].state).toBe("PROCESSING"); });
  it("uses owner CAS and exponential backoff, then permanently fails at max", async () => { const findFirst = vi.fn().mockResolvedValue({ attempts: 2 }); const updateMany = vi.fn().mockResolvedValue({ count: 1 }); const prisma: any = { $transaction: (f: any) => f({ outboxEvent: { findFirst, updateMany } }) }; const s = new OutboxService(prisma, { get: () => "test-outbox-encryption-key-32-characters" } as any); await s.markFailure("e", "owner", "DELIVERY_FAILED", 5); expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ leaseOwner: "owner", attempts: 2 }), data: expect.objectContaining({ state: "PENDING" }) })); findFirst.mockResolvedValue({ attempts: 5 }); await s.markFailure("e", "owner", "x", 5); expect(updateMany.mock.calls[1][0].data.state).toBe("FAILED"); });
  it("does not construct an SMTP transport when disabled", () => { const service = new EmailService({ get: (key: string) => key === "SMTP_ENABLED" ? false : env()[key as keyof ReturnType<typeof env>] } as any); expect(service.isEnabled()).toBe(false); expect(service.send("a@b.test", "x", "y")).rejects.toThrow("SMTP_DISABLED"); });
  it("rejects insecure production MFA and outbox keys", () => { expect(() => validateEnvironment({ DATABASE_URL: "mysql://u:p@localhost/db", NODE_ENV: "production", MFA_ENCRYPTION_KEY: "development-only-mfa-key-change-me-32chars", OUTBOX_ENCRYPTION_KEY: "development-only-outbox-key-change-me-32chars" })).toThrow(); });
  it("requires production SMTP credentials and non-local host", () => { expect(() => validateEnvironment({ ...env(), NODE_ENV: "production", SMTP_ENABLED: true, SMTP_HOST: "localhost", SMTP_USER: undefined, SMTP_PASSWORD: undefined })).toThrow(); });
  it("backfills existing email deliveries before enforcing uniqueness", () => { const sql = readFileSync(resolve(process.cwd(), "prisma/migrations/20260925170000_email_delivery_consistency/migration.sql"), "utf8"); expect(sql).toContain("ADD COLUMN `messageId` VARCHAR(180) NULL"); expect(sql).toContain("UPDATE `EmailDelivery`"); expect(sql).toContain("MODIFY COLUMN `messageId` VARCHAR(180) NOT NULL"); expect(sql).toContain("CREATE UNIQUE INDEX `EmailDelivery_outboxEventId_key`"); });
  it("does not create a session before MFA and does after verification", async () => { const regenerate = vi.fn((cb: any) => cb()); const save = vi.fn((cb: any) => cb()); const request: any = { session: { regenerate, save }, sessionID: "s" }; const auth: any = { authenticate: vi.fn().mockResolvedValue({ id: 4 }), }; const mfa: any = { status: vi.fn().mockResolvedValue({ enabled: true }), createChallenge: vi.fn().mockResolvedValue({ mfaRequired: true }), consumeChallenge: vi.fn().mockResolvedValue(4) }; const c = new AuthController(auth, { reset: vi.fn(), } as any, mfa); await c.login({ email: "a@b.test", password: "x" } as any, request); expect(regenerate).not.toHaveBeenCalled(); await c.mfaVerify({ challenge: "a".repeat(32), code: "123456" }, request); expect(regenerate).toHaveBeenCalledOnce(); expect(save).toHaveBeenCalledOnce(); });
  it("enables MFA transactionally and rejects an expired challenge", async () => { const prisma: any = { mfaChallenge: { findUnique: vi.fn().mockResolvedValue({ id: "c", userId: 1, expiresAt: new Date(Date.now() - 1), attempts: 0, consumedAt: null }) }, $transaction: (fn: any) => fn(prisma) }; const s = new MfaService(prisma, { get: () => "test-mfa-encryption-key-32-characters" } as any); await expect(s.consumeChallenge("x", "123456")).rejects.toMatchObject({ code: "MFA_CHALLENGE_INVALID" }); });
  it("consumes recovery codes with a conditional one-use update", async () => { const updateMany = vi.fn().mockResolvedValue({ count: 1 }); const tx: any = { mfaChallenge: { findUnique: vi.fn().mockResolvedValue({ id: "c", userId: 1, expiresAt: new Date(Date.now() + 10000), attempts: 0, consumedAt: null }), updateMany }, mfaRecoveryCode: { findFirst: vi.fn().mockResolvedValue({ id: "r" }), updateMany }, }; const prisma: any = { $transaction: (f: any) => f(tx) }; const s = new MfaService(prisma, { get: () => "test-mfa-encryption-key-32-characters" } as any); await expect(s.consumeChallenge("x", "recovery", true)).resolves.toBe(1); expect(tx.mfaRecoveryCode.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "r", usedAt: null } })); });
});
