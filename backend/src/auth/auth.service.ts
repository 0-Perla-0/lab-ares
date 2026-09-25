import { Injectable, Optional } from "@nestjs/common";

import { EstadoUsuario } from "../generated/prisma/enums";

import { hashPassword, needsArgon2Rehash, validatePasswordPolicy, verifyPassword } from "./password";
import type { AuthUser } from "./auth-user";
import { UserRepository } from "./user.repository";
import { PrismaService } from "../database/prisma.service";
import { createHash, randomBytes } from "node:crypto";
import { OutboxService } from "./outbox.service";
import { AuditService } from "./audit.service";

const DUMMY_PASSWORD_HASH =
  "$2b$12$iwnUxm94oKjcXFtxO.S3CemzmIUjRsz/cWNBEx2rlRHzcAUVpiGZa";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid credentials");
    this.name = "InvalidCredentialsError";
  }
}

@Injectable()
export class AuthService {
  constructor(private readonly users: UserRepository, @Optional() private readonly prisma?: PrismaService, @Optional() private readonly outbox?: OutboxService, @Optional() private readonly audit?: AuditService) {}

  async requestRecovery(email: string) {
    const user = await this.users.findByEmailForAuth(email);
    if (user) {
      const raw = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(raw).digest("hex");
      if (this.prisma && this.outbox) await this.prisma.$transaction(async (tx) => { const token = await tx.recoveryToken.create({ data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + 30 * 60_000) } }); await this.outbox!.enqueue({ type: "PASSWORD_RECOVERY_REQUESTED", aggregateId: token.id, payload: { token: raw, email: user.email } }, tx); if (this.audit) await this.audit.append({ subjectId: user.id, action: "PASSWORD_RECOVERY_REQUESTED", resource: "identity", metadata: { accepted: true } }, tx); });
    }
    return { accepted: true };
  }

  async resetRecovery(rawToken: string, password: string) {
    validatePasswordPolicy(password);
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    if (!this.prisma || !this.outbox) throw new InvalidCredentialsError();
    const result = await this.prisma.$transaction(async (tx) => {
      const token = await tx.recoveryToken.findUnique({ where: { tokenHash } });
      if (!token || token.usedAt || token.expiresAt <= new Date()) throw new InvalidCredentialsError();
      const claim = await tx.recoveryToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
      if (!claim.count) throw new InvalidCredentialsError();
      await tx.usuario.update({ where: { id: token.userId }, data: { passwordHash: await hashPassword(password) } });
      await tx.session.deleteMany({ where: { userId: token.userId } });
      if (this.audit) await this.audit.append({ subjectId: token.userId, action: "PASSWORD_RECOVERY_RESET", resource: "identity", metadata: { completed: true } }, tx);
      if (tx.notification) await tx.notification.create({ data: { userId: token.userId, type: "PASSWORD_RECOVERED", payload: { completed: true } } });
      if (this.outbox) await this.outbox.enqueue({ type: "PASSWORD_RECOVERY_RESET", aggregateId: String(token.userId), payload: { completed: true } }, tx);
      return { reset: true };
    });
    return result;
  }

  async changePassword(userId: number, current: string, next: string, currentSessionId?: string) {
    const user = await this.users.findByIdForSession(userId);
    if (!user || !(await verifyPassword(current, user.passwordHash))) throw new InvalidCredentialsError();
    const passwordHash = await hashPassword(next);
    if (!this.prisma || !this.outbox) throw new Error("Identity dependencies unavailable");
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: userId }, data: { passwordHash } });
      await tx.session.updateMany({ where: { userId, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) }, data: { revokedAt: new Date() } });
      if (this.audit) await this.audit.append({ actorId: userId, subjectId: userId, action: "PASSWORD_CHANGED", resource: "identity", metadata: { sessionsRevoked: true } }, tx);
      if (tx.notification) await tx.notification.create({ data: { userId, type: "PASSWORD_CHANGED", payload: { sessionsRevoked: true } } });
      if (this.outbox) await this.outbox.enqueue({ type: "PASSWORD_CHANGED", aggregateId: String(userId), payload: { userId } }, tx);
    });
    return { changed: true };
  }

  listSessions(userId: number) { if (!this.prisma) throw new Error("Identity dependencies unavailable"); return this.prisma.session.findMany({ where: { userId, revokedAt: null }, select: { id:true, createdAt:true, lastActivityAt:true, expiresAt:true, absoluteExpiresAt:true, userAgentSummary:true } }); }
  async revokeSession(userId: number, id: string) { if (!this.prisma) throw new Error("Identity dependencies unavailable"); return this.prisma.$transaction(async (tx) => { const result = await tx.session.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } }); if (!result.count) throw new InvalidCredentialsError(); if (this.audit) await this.audit.append({ actorId: userId, subjectId: userId, action: "SESSION_REVOKED", resource: "session", correlationId: id }, tx); if (tx.notification) await tx.notification.create({ data: { userId, type: "SESSION_REVOKED", payload: { sessionId: id } } }); if (this.outbox) await this.outbox.enqueue({ type: "SESSION_REVOKED", aggregateId: id, payload: { actorId: userId } }, tx); return result; }); }
  async revokeOtherSessions(userId: number, currentId: string) { if (!this.prisma) throw new Error("Identity dependencies unavailable"); return this.prisma.$transaction(async (tx) => { const result = await tx.session.updateMany({ where: { userId, id: { not: currentId }, revokedAt: null }, data: { revokedAt: new Date() } }); if (this.audit) await this.audit.append({ actorId: userId, subjectId: userId, action: "OTHER_SESSIONS_REVOKED", resource: "session", metadata: { count: result.count } }, tx); if (this.outbox) await this.outbox.enqueue({ type: "OTHER_SESSIONS_REVOKED", aggregateId: String(userId), payload: { actorId: userId, count: result.count } }, tx); return result; }); }

  async authenticate(email: string, password: string): Promise<AuthUser> {
    const user = await this.users.findByEmailForAuth(email);

    // Always perform bcrypt work so a missing email is not measurably faster.
    const passwordMatches = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches || user.estado !== EstadoUsuario.ACTIVA) {
      throw new InvalidCredentialsError();
    }

    if (needsArgon2Rehash(user.passwordHash)) {
      // Rehash asynchronously after a successful legacy bcrypt login. The
      // authentication result never depends on this best-effort upgrade.
      void hashPassword(password).then((hash) => this.users.updatePasswordHash(user.id, hash, user.passwordHash));
    }

    return {
      id: user.id,
      codigo: user.codigo,
      email: user.email,
      rol: user.rol,
      estado: user.estado,
      sedeId: user.sedeId,
      areaId: user.areaId,
      turnoId: user.turnoId,
    };
  }
}
