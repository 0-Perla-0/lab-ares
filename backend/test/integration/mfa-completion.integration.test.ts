import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { MfaService, totpCode } from "../../src/auth/mfa.service";
import { AuditService } from "../../src/auth/audit.service";
import { AuthService } from "../../src/auth/auth.service";
import { UserRepository } from "../../src/auth/user.repository";
import { OutboxService } from "../../src/auth/outbox.service";
import { hashPassword, verifyPassword } from "../../src/auth/password";

const url = process.env.DATABASE_URL;
if (!url || !/_(test|ci)$/.test(new URL(url).pathname))
  throw new Error("MFA concurrency requires an isolated _test/_ci database");
const config = new ConfigService({
  DATABASE_URL: url,
  MFA_ENCRYPTION_KEY: "integration-mfa-only-key-32-characters",
  OUTBOX_ENCRYPTION_KEY: "integration-mfa-outbox-key-32-characters",
});
const first = new PrismaService(config),
  second = new PrismaService(config);
const audit = new AuditService(first);
const mfa = new MfaService(first, config as any, audit),
  replica = new MfaService(second, config as any, new AuditService(second));
const password = "Integration-MFA-Only!2026";
function decode(secret: string) {
  let value = 0,
    bits = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    value = (value << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  return Buffer.from(bytes).toString("base64url");
}
async function account() {
  const suffix = randomUUID().slice(0, 8);
  const user = await first.usuario.create({
    data: {
      codigo: `mfa-${suffix}`,
      email: `mfa-${suffix}@example.test`,
      passwordHash: await hashPassword(password),
      estado: "ACTIVA",
      rol: "PRESTADOR",
    },
  });
  const setup = await mfa.setup(user.id, password),
    secret = decode(setup.secret);
  const step = Math.floor(Date.now() / 30000);
  const enabled = await mfa.enable(user.id, totpCode(secret, step));
  return { user, secret, codes: enabled.recoveryCodes, step };
}
describe("real multi-replica MFA and transactional password changes", () => {
  afterAll(async () => {
    await first.$disconnect();
    await second.$disconnect();
  });
  it("claims a TOTP counter only once across independent challenges/replicas", async () => {
    const h = await account(),
      one = await mfa.createChallenge(h.user.id),
      two = await replica.createChallenge(h.user.id);
    const code = totpCode(h.secret, Math.floor(Date.now() / 30000) + 1);
    const attempts = await Promise.allSettled([
      mfa.consumeChallenge(one.challenge, code),
      replica.consumeChallenge(two.challenge, code),
    ]);
    expect(attempts.filter((row) => row.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(
      await first.mfaChallenge.count({
        where: { userId: h.user.id, consumedAt: { not: null } },
      }),
    ).toBe(1);
  });
  it("claims a recovery code once and writes one audit/notification/outbox", async () => {
    const h = await account(),
      one = await mfa.createChallenge(h.user.id),
      two = await replica.createChallenge(h.user.id);
    const attempts = await Promise.allSettled([
      mfa.consumeChallenge(one.challenge, h.codes[0], true),
      replica.consumeChallenge(two.challenge, h.codes[0], true),
    ]);
    expect(attempts.filter((row) => row.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(
      await first.mfaRecoveryCode.count({
        where: { userId: h.user.id, usedAt: { not: null } },
      }),
    ).toBe(1);
    expect(
      await first.auditEvent.count({
        where: { subjectId: h.user.id, action: "MFA_RECOVERY_CODE_USED" },
      }),
    ).toBe(1);
    expect(
      await first.notification.count({
        where: { userId: h.user.id, type: "MFA_RECOVERY_CODE_USED" },
      }),
    ).toBe(1);
  });
  it("serializes regeneration and disable using the same recovery factor", async () => {
    const h = await account();
    const attempts = await Promise.allSettled([
      mfa.regenerate(h.user.id, password, h.codes[0], true),
      replica.disable(h.user.id, password, h.codes[0], true),
    ]);
    expect(attempts.filter((row) => row.status === "fulfilled")).toHaveLength(
      1,
    );
    const state = await mfa.status(h.user.id);
    expect(
      await first.mfaRecoveryCode.count({ where: { userId: h.user.id } }),
    ).toBe(state.enabled ? 10 : 0);
    await expect(
      mfa.regenerate(h.user.id, password, h.codes[0], true),
    ).rejects.toBeDefined();
  });
  it("rolls back password and factor together when critical audit fails", async () => {
    const h = await account(),
      next = "Integration-MFA-Updated!2026";
    const code = totpCode(h.secret, Math.floor(Date.now() / 30000) + 1);
    const failing = new AuthService(
      new UserRepository(first),
      first,
      new OutboxService(first, config as any),
      {
        append: async () => {
          throw new Error("forced MFA/password rollback");
        },
      } as any,
      undefined,
      mfa,
    );
    await expect(
      failing.changePassword(h.user.id, password, next, undefined, code),
    ).rejects.toThrow("forced MFA/password rollback");
    const stored = await first.usuario.findUniqueOrThrow({
      where: { id: h.user.id },
    });
    expect(await verifyPassword(password, stored.passwordHash)).toBe(true);
    expect(
      (await first.userMfa.findUniqueOrThrow({ where: { userId: h.user.id } }))
        .lastAcceptedStep,
    ).toBe(BigInt(h.step));
    const valid = new AuthService(
      new UserRepository(first),
      first,
      new OutboxService(first, config as any),
      audit,
      undefined,
      mfa,
    );
    expect(
      await valid.changePassword(h.user.id, password, next, undefined, code),
    ).toEqual({ changed: true });
    expect(
      await verifyPassword(
        next,
        (await first.usuario.findUniqueOrThrow({ where: { id: h.user.id } }))
          .passwordHash,
      ),
    ).toBe(true);
  });
  it("rejects missing factor inside the credential transaction", async () => {
    const h = await account();
    const auth = new AuthService(
      new UserRepository(first),
      first,
      new OutboxService(first, config as any),
      audit,
      undefined,
      mfa,
    );
    await expect(
      auth.changePassword(h.user.id, password, "Another-MFA-Updated!2026"),
    ).rejects.toMatchObject({ code: "MFA_CODE_REQUIRED" });
    expect(
      await verifyPassword(
        password,
        (await first.usuario.findUniqueOrThrow({ where: { id: h.user.id } }))
          .passwordHash,
      ),
    ).toBe(true);
  });
  it("denies an in-flight password change after its session is revoked", async () => {
    const h = await account(),
      id = `mfa-session-${randomUUID()}`;
    await first.session.create({
      data: {
        id,
        userId: h.user.id,
        data: {},
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        absoluteExpiresAt: new Date(Date.now() + 60000),
      },
    });
    const auth = new AuthService(
      new UserRepository(first),
      first,
      new OutboxService(first, config as any),
      audit,
      undefined,
      mfa,
    );
    await expect(
      auth.changePassword(
        h.user.id,
        password,
        "Another-MFA-Updated!2026",
        id,
        totpCode(h.secret, Math.floor(Date.now() / 30000) + 1),
      ),
    ).rejects.toBeDefined();
    expect(
      (await first.userMfa.findUniqueOrThrow({ where: { userId: h.user.id } }))
        .lastAcceptedStep,
    ).toBe(BigInt(h.step));
    expect(
      await verifyPassword(
        password,
        (await first.usuario.findUniqueOrThrow({ where: { id: h.user.id } }))
          .passwordHash,
      ),
    ).toBe(true);
  });
  it("fails closed for credential changes under a recovery freeze", async () => {
    const h = await account();
    const auth = new AuthService(
      new UserRepository(first),
      first,
      new OutboxService(first, config as any),
      audit,
      undefined,
      mfa,
    );
    await first.recoveryWriteBarrier.update({
      where: { id: "global" },
      data: { active: true },
    });
    try {
      await expect(
        auth.changePassword(
          h.user.id,
          password,
          "Another-MFA-Updated!2026",
          undefined,
          totpCode(h.secret, Math.floor(Date.now() / 30000) + 1),
        ),
      ).rejects.toMatchObject({ code: "RECOVERY_WRITE_BARRIER_ACTIVE" });
    } finally {
      await first.recoveryWriteBarrier.update({
        where: { id: "global" },
        data: { active: false },
      });
    }
  });
});
