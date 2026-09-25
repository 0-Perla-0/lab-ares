import { describe, expect, it, vi } from "vitest";
import { AuthService, InvalidCredentialsError } from "../../../src/auth/auth.service";

vi.mock("../../../src/auth/password", () => ({ hashPassword: vi.fn().mockResolvedValue("argon2-new"), validatePasswordPolicy: vi.fn(), verifyPassword: vi.fn().mockResolvedValue(true), needsArgon2Rehash: vi.fn(() => false) }));

function setup() {
  const user = { id: 7, email: "owner@example.com", passwordHash: "old", codigo: "U7", rol: "PRESTADOR", estado: "ACTIVA", sedeId: null, areaId: null, turnoId: null };
  const token = { id: "rt-1", userId: 7, expiresAt: new Date(Date.now() + 60000), usedAt: null };
  const tx: any = { recoveryToken: { create: vi.fn().mockResolvedValue(token), findUnique: vi.fn().mockResolvedValue(token), updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, usuario: { update: vi.fn().mockResolvedValue(user) }, session: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
  const prisma: any = { $transaction: vi.fn(async (fn: any) => fn(tx)) };
  const users: any = { findByEmailForAuth: vi.fn().mockResolvedValue(user), findByIdForSession: vi.fn().mockResolvedValue(user), updatePasswordHash: vi.fn() };
  const outbox: any = { enqueue: vi.fn().mockResolvedValue({}) }; const audit: any = { append: vi.fn().mockResolvedValue({}) };
  return { service: new AuthService(users, prisma, outbox, audit), users, prisma, tx, outbox, audit, token };
}

describe("recovery and password transaction regressions", () => {
  it("returns a generic response for existing and nonexistent emails", async () => { const x = setup(); await expect(x.service.requestRecovery("owner@example.com")).resolves.toEqual({ accepted: true }); x.users.findByEmailForAuth.mockResolvedValue(null); await expect(x.service.requestRecovery("missing@example.com")).resolves.toEqual({ accepted: true }); });
  it("stores only a token hash and never plaintext in outbox", async () => { const x = setup(); await x.service.requestRecovery("owner@example.com"); const payload = x.outbox.enqueue.mock.calls[0][0].payload; expect(payload.token).toBeTypeOf("string"); expect(payload.token).not.toBe(""); });
  it.each(["expired", "used", "missing"])("rejects %s reset tokens", async (kind) => { const x = setup(); if (kind === "expired") x.tx.recoveryToken.findUnique.mockResolvedValue({ ...x.token, expiresAt: new Date(Date.now() - 1) }); if (kind === "used") x.tx.recoveryToken.findUnique.mockResolvedValue({ ...x.token, usedAt: new Date() }); if (kind === "missing") x.tx.recoveryToken.findUnique.mockResolvedValue(null); await expect(x.service.resetRecovery("not-a-token", "A-valid-password-123!")).rejects.toBeInstanceOf(InvalidCredentialsError); });
  it("claims a reset token once under concurrency", async () => { const x = setup(); x.tx.recoveryToken.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }); await expect(x.service.resetRecovery("same", "A-valid-password-123!")).resolves.toEqual({ reset: true }); await expect(x.service.resetRecovery("same", "A-valid-password-123!")).rejects.toBeInstanceOf(InvalidCredentialsError); });
  it("rolls back reset when audit/outbox fails and revokes sessions transactionally", async () => { const x = setup(); x.outbox.enqueue.mockRejectedValue(new Error("delivery")); await expect(x.service.resetRecovery("raw", "A-valid-password-123!")).rejects.toThrow("delivery"); expect(x.tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 7 } }); });
  it("preserves current session on password change", async () => { const x = setup(); await expect(x.service.changePassword(7, "current", "A-new-password-123!", "sid-current")).resolves.toEqual({ changed: true }); expect(x.tx.session.updateMany).toHaveBeenCalledWith({ where: { userId: 7, id: { not: "sid-current" } }, data: { revokedAt: expect.any(Date) } }); });
  it("rolls back password change when audit fails", async () => { const x = setup(); x.audit.append.mockRejectedValue(new Error("audit")); await expect(x.service.changePassword(7, "current", "A-new-password-123!", "sid-current")).rejects.toThrow("audit"); expect(x.tx.usuario.update).toHaveBeenCalled(); });
});
