import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database/prisma.service";
import type { Environment } from "../config/environment";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { hashPassword, verifyPassword } from "./password";
import { ApiException } from "../common/errors/api.exception";

const stepSeconds = 30;
const window = 1;
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
export function totpCode(secret: string, counter: number) {
  const key = Buffer.from(secret, "base64url");
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(b).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

@Injectable()
export class MfaService {
  private readonly key: Buffer;
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Environment, true>,
  ) {
    const raw = config.get("MFA_ENCRYPTION_KEY", { infer: true });
    if (!raw) throw new Error("MFA_ENCRYPTION_KEY must be configured");
    this.key = createHash("sha256").update(raw).digest();
  }
  private encrypt(secret: string) {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([c.update(secret, "utf8"), c.final()]);
    return [
      iv.toString("base64url"),
      c.getAuthTag().toString("base64url"),
      data.toString("base64url"),
    ].join(".");
  }
  private decrypt(value: string) {
    const [iv, tag, data] = value.split(".");
    const d = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(iv, "base64url"),
    );
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      d.update(Buffer.from(data, "base64url")),
      d.final(),
    ]).toString("utf8");
  }
  private code(secret: string, counter: number) {
    return totpCode(secret, counter);
  }
  private verify(
    secret: string,
    token: string,
    now = Date.now(),
    last?: bigint | null,
  ) {
    const n = Math.floor(now / 1000 / stepSeconds);
    for (let i = -window; i <= window; i++) {
      const c = n + i;
      if (
        c >= 0 &&
        this.code(secret, c) === token &&
        (last == null || BigInt(c) > last)
      )
        return c;
    }
    return null;
  }
  async status(userId: number) {
    const m = await this.prisma.userMfa.findUnique({ where: { userId } });
    return { enabled: !!m?.enabledAt };
  }
  async setup(userId: number) {
    const user = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: userId },
    });
    const secret = randomBytes(20).toString("base64url");
    await this.prisma.userMfa.upsert({
      where: { userId },
      create: { userId, secretCiphertext: this.encrypt(secret) },
      update: {
        secretCiphertext: this.encrypt(secret),
        enabledAt: null,
        lastAcceptedStep: null,
      },
    });
    return {
      secret,
      otpauthUri: `otpauth://totp/ARES:${encodeURIComponent(user.email)}?secret=${secret}&issuer=ARES`,
    };
  }
  async enable(userId: number, token: string) {
    const m = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!m) throw new ApiException("MFA_NOT_SETUP", 400);
    const secret = this.decrypt(m.secretCiphertext);
    const accepted = this.verify(secret, token, Date.now(), m.lastAcceptedStep);
    if (accepted === null) throw new ApiException("MFA_CODE_INVALID", 400);
    const codes = Array.from({ length: 10 }, () =>
      randomBytes(8).toString("hex"),
    );
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.userMfa.updateMany({
        where: { userId, enabledAt: null, OR: [{ lastAcceptedStep: null }, { lastAcceptedStep: { lt: BigInt(accepted) } }] },
        data: { enabledAt: new Date(), lastAcceptedStep: BigInt(accepted) },
      });
      if (!claimed.count) throw new ApiException("MFA_CODE_REPLAYED", 400);
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((c) => ({ userId, codeHash: digest(c) })),
      });
      await tx.auditEvent.create({
        data: {
          subjectId: userId,
          action: "MFA_ENABLED",
          resource: "identity",
        },
      });
      await tx.notification.create({
        data: { userId, type: "MFA_ENABLED", payload: { enabled: true } },
      });
    });
    return { recoveryCodes: codes };
  }
  async disable(userId: number, password: string, token: string) {
    await this.assertPassword(userId, password);
    await this.consumeTotp(userId, token);
    await this.prisma.$transaction(async (tx) => {
      await tx.userMfa.update({ where: { userId }, data: { enabledAt: null } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.auditEvent.create({
        data: {
          actorId: userId,
          subjectId: userId,
          action: "MFA_DISABLED",
          resource: "identity",
        },
      });
      await tx.notification.create({
        data: { userId, type: "MFA_DISABLED", payload: { enabled: false } },
      });
    });
    return { disabled: true };
  }
  async regenerate(userId: number, password: string, token: string) {
    await this.assertPassword(userId, password);
    await this.consumeTotp(userId, token);
    const codes = Array.from({ length: 10 }, () =>
      randomBytes(8).toString("hex"),
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((c) => ({ userId, codeHash: digest(c) })),
      });
    });
    return { recoveryCodes: codes };
  }
  private async assertPassword(userId: number, password: string) {
    const u = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!u || !(await verifyPassword(password, u.passwordHash)))
      throw new ApiException("INVALID_CREDENTIALS", 401);
  }
  async consumeTotp(userId: number, token: string) {
    const m = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!m?.enabledAt) throw new ApiException("MFA_NOT_ENABLED", 400);
    const c = this.verify(
      this.decrypt(m.secretCiphertext),
      token,
      Date.now(),
      m.lastAcceptedStep,
    );
    if (c === null) throw new ApiException("MFA_CODE_INVALID", 400);
    const updated = await this.prisma.userMfa.updateMany({
      where: {
        userId,
        OR: [
          { lastAcceptedStep: null },
          { lastAcceptedStep: { lt: BigInt(c) } },
        ],
      },
      data: { lastAcceptedStep: BigInt(c) },
    });
    if (!updated.count) throw new ApiException("MFA_CODE_REPLAYED", 400);
  }
  async createChallenge(userId: number) {
    const raw = randomBytes(32).toString("base64url");
    await this.prisma.mfaChallenge.create({
      data: {
        userId,
        tokenHash: digest(raw),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return { mfaRequired: true, challenge: raw, expiresIn: 300 };
  }
  async consumeChallenge(raw: string, token: string, recovery = false) {
    const hash = digest(raw);
    let result: { kind: string; userId?: number };
    try {
      result = await this.prisma.$transaction(async (tx) => {
      const c = await tx.mfaChallenge.findUnique({ where: { tokenHash: hash } });
      if (!c || c.consumedAt || c.expiresAt <= new Date() || c.attempts >= 5) return { kind: "invalid" as const };
      const now = new Date();
      if (recovery) {
        const code = await tx.mfaRecoveryCode.findFirst({ where: { userId: c.userId, codeHash: digest(token), usedAt: null } });
        if (!code) {
          await tx.mfaChallenge.updateMany({ where: { id: c.id, consumedAt: null, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
          return { kind: "code-invalid" as const };
        }
        const used = await tx.mfaRecoveryCode.updateMany({ where: { id: code.id, usedAt: null }, data: { usedAt: now } });
        if (!used.count) return { kind: "code-invalid" as const };
      } else {
        const mfa = await tx.userMfa.findUnique({ where: { userId: c.userId } });
        if (!mfa?.enabledAt) return { kind: "disabled" as const };
        const step = this.verify(this.decrypt(mfa.secretCiphertext), token, Date.now(), mfa.lastAcceptedStep);
        if (step === null) {
          await tx.mfaChallenge.updateMany({ where: { id: c.id, consumedAt: null, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
          return { kind: "code-invalid" as const };
        }
        const accepted = await tx.userMfa.updateMany({ where: { userId: c.userId, OR: [{ lastAcceptedStep: null }, { lastAcceptedStep: { lt: BigInt(step) } }] }, data: { lastAcceptedStep: BigInt(step) } });
        if (!accepted.count) return { kind: "replayed" as const };
      }
      const consumed = await tx.mfaChallenge.updateMany({ where: { id: c.id, consumedAt: null, attempts: { lt: 5 } }, data: { consumedAt: now, attempts: { increment: 1 } } });
      if (!consumed.count) throw new Error("MFA_CONCURRENT_CLAIM");
      return { kind: "ok" as const, userId: c.userId };
      });
    } catch (error) {
      if (error instanceof Error && error.message === "MFA_CONCURRENT_CLAIM") throw new ApiException("MFA_CHALLENGE_INVALID", 401);
      throw error;
    }
    if (result.kind === "ok") return result.userId;
    if (result.kind === "disabled") throw new ApiException("MFA_NOT_ENABLED", 401);
    if (result.kind === "replayed") throw new ApiException("MFA_CODE_REPLAYED", 401);
    if (result.kind === "code-invalid") throw new ApiException("MFA_CODE_INVALID", 401);
    throw new ApiException("MFA_CHALLENGE_INVALID", 401);
  }
}
