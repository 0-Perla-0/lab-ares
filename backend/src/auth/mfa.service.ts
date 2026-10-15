import { Injectable, Optional } from "@nestjs/common";
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
import { AuditService } from "./audit.service";
import { operationalNotification } from "../common/domain/operational-notification";
import type { Prisma } from "../generated/prisma/client";
import { EstadoUsuario } from "../generated/prisma/enums";
import { AuthThrottleService } from "./auth-throttle.service";

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

export function base32Secret(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    buffer = 0,
    result = "";
  for (const byte of Buffer.from(secret, "base64url")) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(buffer >>> bits) & 31];
    }
  }
  if (bits) result += alphabet[(buffer << (5 - bits)) & 31];
  return result;
}

@Injectable()
export class MfaService {
  private readonly key: Buffer;
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Environment, true>,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly throttle?: AuthThrottleService,
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
  async setup(userId: number, password: string) {
    await this.assertPassword(userId, password);
    const user = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: userId },
    });
    const secret = randomBytes(20).toString("base64url");
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM Usuario WHERE id = ${userId} FOR UPDATE`;
      const current = await tx.userMfa.findUnique({ where: { userId } });
      if (current?.enabledAt)
        throw new ApiException("MFA_ALREADY_ENABLED", 409);
      await tx.userMfa.upsert({
        where: { userId },
        create: { userId, secretCiphertext: this.encrypt(secret) },
        update: {
          secretCiphertext: this.encrypt(secret),
          enabledAt: null,
          lastAcceptedStep: null,
        },
      });
    });
    return {
      secret: base32Secret(secret),
      otpauthUri: `otpauth://totp/ARES:${encodeURIComponent(user.email)}?secret=${base32Secret(secret)}&issuer=ARES&algorithm=SHA1&digits=6&period=30`,
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
        where: {
          userId,
          enabledAt: null,
          secretCiphertext: m.secretCiphertext,
          OR: [
            { lastAcceptedStep: null },
            { lastAcceptedStep: { lt: BigInt(accepted) } },
          ],
        },
        data: { enabledAt: new Date(), lastAcceptedStep: BigInt(accepted) },
      });
      if (!claimed.count) throw new ApiException("MFA_CODE_REPLAYED", 400);
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((c) => ({ userId, codeHash: digest(c) })),
      });
      await (this.audit ?? new AuditService(this.prisma)).append(
        {
          subjectId: userId,
          action: "MFA_ENABLED",
          resource: "identity",
          module: "IDENTITY",
          objectType: "MFA",
          objectId: String(userId),
        },
        tx,
      );
      await operationalNotification(tx, userId, "MFA_ENABLED", {
        enabled: true,
      });
    });
    return { recoveryCodes: codes };
  }
  async disable(
    userId: number,
    password: string,
    token: string,
    recovery = false,
  ) {
    const user = await this.assertPassword(userId, password);
    await this.prisma.$transaction(async (tx) => {
      await this.lockCredential(tx, userId, user.passwordHash);
      await this.consumeFactor(tx, userId, token, recovery);
      await tx.userMfa.update({ where: { userId }, data: { enabledAt: null } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaChallenge.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await (this.audit ?? new AuditService(this.prisma)).append(
        {
          actorId: userId,
          subjectId: userId,
          action: "MFA_DISABLED",
          resource: "identity",
          module: "IDENTITY",
          objectType: "MFA",
          objectId: String(userId),
        },
        tx,
      );
      await operationalNotification(tx, userId, "MFA_DISABLED", {
        enabled: false,
      });
    });
    return { disabled: true };
  }
  async regenerate(
    userId: number,
    password: string,
    token: string,
    recovery = false,
  ) {
    const user = await this.assertPassword(userId, password);
    const codes = Array.from({ length: 10 }, () =>
      randomBytes(8).toString("hex"),
    );
    await this.prisma.$transaction(async (tx) => {
      await this.lockCredential(tx, userId, user.passwordHash);
      await this.consumeFactor(tx, userId, token, recovery);
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((c) => ({ userId, codeHash: digest(c) })),
      });
      await (this.audit ?? new AuditService(this.prisma)).append(
        {
          actorId: userId,
          subjectId: userId,
          action: "MFA_RECOVERY_CODES_REGENERATED",
          resource: "identity",
        },
        tx,
      );
      await operationalNotification(
        tx,
        userId,
        "MFA_RECOVERY_CODES_REGENERATED",
        { regenerated: true },
      );
    });
    return { recoveryCodes: codes };
  }
  private async assertPassword(userId: number, password: string) {
    const u = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!u || !(await verifyPassword(password, u.passwordHash)))
      throw new ApiException("INVALID_CREDENTIALS", 401);
    return u;
  }

  private async lockCredential(
    tx: Prisma.TransactionClient,
    userId: number,
    passwordHash: string,
  ) {
    await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${userId} FOR UPDATE`;
    const fresh = await tx.usuario.findUnique({ where: { id: userId } });
    if (
      fresh?.estado !== EstadoUsuario.ACTIVA ||
      fresh.passwordHash !== passwordHash
    )
      throw new ApiException("INVALID_CREDENTIALS", 401);
  }

  private async consumeFactor(
    tx: Prisma.TransactionClient,
    userId: number,
    token: string,
    recovery: boolean,
  ) {
    const m = await tx.userMfa.findUnique({ where: { userId } });
    if (!m?.enabledAt) throw new ApiException("MFA_NOT_ENABLED", 400);
    if (recovery) {
      const claimed = await tx.mfaRecoveryCode.updateMany({
        where: { userId, codeHash: digest(token), usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!claimed.count) throw new ApiException("MFA_CODE_INVALID", 400);
      await (this.audit ?? new AuditService(this.prisma)).append(
        {
          actorId: userId,
          subjectId: userId,
          action: "MFA_RECOVERY_CODE_USED",
          resource: "identity",
          module: "IDENTITY",
        },
        tx,
      );
      await operationalNotification(tx, userId, "MFA_RECOVERY_CODE_USED", {
        recovered: true,
      });
      return;
    }
    const step = this.verify(
      this.decrypt(m.secretCiphertext),
      token,
      Date.now(),
      m.lastAcceptedStep,
    );
    if (step === null) throw new ApiException("MFA_CODE_INVALID", 400);
    const claimed = await tx.userMfa.updateMany({
      where: {
        userId,
        secretCiphertext: m.secretCiphertext,
        enabledAt: { not: null },
        OR: [
          { lastAcceptedStep: null },
          { lastAcceptedStep: { lt: BigInt(step) } },
        ],
      },
      data: { lastAcceptedStep: BigInt(step) },
    });
    if (!claimed.count) throw new ApiException("MFA_CODE_REPLAYED", 400);
  }
  async consumeTotp(userId: number, token: string) {
    const account = this.throttle
      ? await this.prisma.usuario.findUnique({
          where: { id: userId },
          select: { email: true },
        })
      : null;
    if (account) await this.throttle!.assertAccount(account.email);
    const m = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!m?.enabledAt) throw new ApiException("MFA_NOT_ENABLED", 400);
    const c = this.verify(
      this.decrypt(m.secretCiphertext),
      token,
      Date.now(),
      m.lastAcceptedStep,
    );
    if (c === null) {
      if (account) await this.throttle!.failure(account.email);
      throw new ApiException("MFA_CODE_INVALID", 400);
    }
    const updated = await this.prisma.userMfa.updateMany({
      where: {
        userId,
        enabledAt: { not: null },
        secretCiphertext: m.secretCiphertext,
        OR: [
          { lastAcceptedStep: null },
          { lastAcceptedStep: { lt: BigInt(c) } },
        ],
      },
      data: { lastAcceptedStep: BigInt(c) },
    });
    if (!updated.count) throw new ApiException("MFA_CODE_REPLAYED", 400);
  }
  /** Caller holds the Usuario lock. Factor consumption rolls back with the
   * credential mutation, audit and outbox rather than preceding them. */
  async passwordChangeFactor(
    tx: Prisma.TransactionClient,
    userId: number,
    token?: string,
  ) {
    const current = await tx.userMfa.findUnique({ where: { userId } });
    if (!current?.enabledAt) return;
    if (!token) throw new ApiException("MFA_CODE_REQUIRED", 400);
    await this.consumeFactor(tx, userId, token, false);
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
    const challenge = await this.prisma.mfaChallenge.findUnique({
      where: { tokenHash: hash },
      select: { userId: true },
    });
    const account =
      challenge && this.throttle
        ? await this.prisma.usuario.findUnique({
            where: { id: challenge.userId },
            select: { email: true },
          })
        : null;
    if (account) await this.throttle!.assertAccount(account.email);
    let result: { kind: string; userId?: number };
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          const c = await tx.mfaChallenge.findUnique({
            where: { tokenHash: hash },
          });
          if (
            !c ||
            c.consumedAt ||
            c.expiresAt <= new Date() ||
            c.attempts >= 5
          )
            return { kind: "invalid" as const };
          await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${c.userId} FOR UPDATE`;
          const user = await tx.usuario.findUnique({
            where: { id: c.userId },
            select: { estado: true },
          });
          if (user?.estado !== EstadoUsuario.ACTIVA)
            return { kind: "invalid" as const };
          const currentMfa = await tx.userMfa.findUnique({
            where: { userId: c.userId },
          });
          if (!currentMfa?.enabledAt) return { kind: "disabled" as const };
          const now = new Date();
          if (recovery) {
            const code = await tx.mfaRecoveryCode.findFirst({
              where: {
                userId: c.userId,
                codeHash: digest(token),
                usedAt: null,
              },
            });
            if (!code) {
              await tx.mfaChallenge.updateMany({
                where: { id: c.id, consumedAt: null, attempts: { lt: 5 } },
                data: { attempts: { increment: 1 } },
              });
              return { kind: "code-invalid" as const };
            }
            const used = await tx.mfaRecoveryCode.updateMany({
              where: { id: code.id, usedAt: null },
              data: { usedAt: now },
            });
            if (!used.count) return { kind: "code-invalid" as const };
          } else {
            const mfa = await tx.userMfa.findUnique({
              where: { userId: c.userId },
            });
            if (!mfa?.enabledAt) return { kind: "disabled" as const };
            const step = this.verify(
              this.decrypt(mfa.secretCiphertext),
              token,
              Date.now(),
              mfa.lastAcceptedStep,
            );
            if (step === null) {
              await tx.mfaChallenge.updateMany({
                where: { id: c.id, consumedAt: null, attempts: { lt: 5 } },
                data: { attempts: { increment: 1 } },
              });
              return { kind: "code-invalid" as const };
            }
            const accepted = await tx.userMfa.updateMany({
              where: {
                userId: c.userId,
                OR: [
                  { lastAcceptedStep: null },
                  { lastAcceptedStep: { lt: BigInt(step) } },
                ],
              },
              data: { lastAcceptedStep: BigInt(step) },
            });
            if (!accepted.count) return { kind: "replayed" as const };
          }
          const consumed = await tx.mfaChallenge.updateMany({
            where: { id: c.id, consumedAt: null, attempts: { lt: 5 } },
            data: { consumedAt: now, attempts: { increment: 1 } },
          });
          if (!consumed.count) throw new Error("MFA_CONCURRENT_CLAIM");
          if (recovery) {
            await (this.audit ?? new AuditService(this.prisma)).append(
              {
                actorId: c.userId,
                subjectId: c.userId,
                action: "MFA_RECOVERY_CODE_USED",
                resource: "identity",
                module: "IDENTITY",
                metadata: { recovered: true },
              },
              tx,
            );
            await operationalNotification(
              tx,
              c.userId,
              "MFA_RECOVERY_CODE_USED",
              { recovered: true },
            );
          }
          return { kind: "ok" as const, userId: c.userId };
        },
        { isolationLevel: "ReadCommitted" },
      );
    } catch (error) {
      if (error instanceof Error && error.message === "MFA_CONCURRENT_CLAIM")
        throw new ApiException("MFA_CHALLENGE_INVALID", 401);
      throw error;
    }
    if (result.kind === "ok") return result.userId;
    if (account && result.kind === "code-invalid")
      await this.throttle!.failure(account.email);
    if (result.kind === "disabled")
      throw new ApiException("MFA_NOT_ENABLED", 401);
    if (result.kind === "replayed")
      throw new ApiException("MFA_CODE_REPLAYED", 401);
    if (result.kind === "code-invalid")
      throw new ApiException("MFA_CODE_INVALID", 401);
    throw new ApiException("MFA_CHALLENGE_INVALID", 401);
  }
}
