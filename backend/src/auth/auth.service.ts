import { Injectable, Optional } from "@nestjs/common";

import { EstadoUsuario } from "../generated/prisma/enums";

import {
  hashPassword,
  needsArgon2Rehash,
  validatePasswordPolicy,
  verifyPassword,
} from "./password";
import type { AuthUser } from "./auth-user";
import { UserRepository } from "./user.repository";
import { PrismaService } from "../database/prisma.service";
import { createHash, randomBytes } from "node:crypto";
import { OutboxService } from "./outbox.service";
import { AuditService } from "./audit.service";
import { ApiException } from "../common/errors/api.exception";
import { AuthThrottleService } from "./auth-throttle.service";
import { MfaService } from "./mfa.service";

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
  constructor(
    private readonly users: UserRepository,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly outbox?: OutboxService,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly throttle?: AuthThrottleService,
    @Optional() private readonly mfa?: MfaService,
  ) {}

  async requestRecovery(email: string) {
    const user = await this.users.findByEmailForAuth(email);
    if (user?.estado === EstadoUsuario.ACTIVA) {
      const raw = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(raw).digest("hex");
      if (this.prisma && this.outbox)
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT id FROM Usuario WHERE id = ${user.id} FOR UPDATE`;
          const current = await tx.usuario.findUnique({
            where: { id: user.id },
            select: { estado: true },
          });
          if (current?.estado !== EstadoUsuario.ACTIVA) return;
          await tx.recoveryToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          const token = await tx.recoveryToken.create({
            data: {
              tokenHash,
              userId: user.id,
              expiresAt: new Date(Date.now() + 30 * 60_000),
            },
          });
          await this.outbox!.enqueue(
            {
              type: "PASSWORD_RECOVERY_REQUESTED",
              aggregateId: token.id,
              payload: { token: raw, email: user.email },
            },
            tx,
          );
          if (this.audit)
            await this.audit.append(
              {
                subjectId: user.id,
                action: "PASSWORD_RECOVERY_REQUESTED",
                resource: "identity",
                metadata: { accepted: true },
              },
              tx,
            );
        });
    }
    return { accepted: true };
  }

  async resetRecovery(rawToken: string, password: string) {
    validatePasswordPolicy(password);
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    if (!this.prisma || !this.outbox) throw new InvalidCredentialsError();
    const result = await this.prisma.$transaction(async (tx) => {
      const token = await tx.recoveryToken.findUnique({ where: { tokenHash } });
      if (!token || token.usedAt || token.expiresAt <= new Date())
        throw new InvalidCredentialsError();
      await tx.$executeRaw`SELECT id FROM Usuario WHERE id = ${token.userId} FOR UPDATE`;
      const user = await tx.usuario.findUnique({
        where: { id: token.userId },
        select: { estado: true, email: true, codigo: true },
      });
      if (user?.estado !== EstadoUsuario.ACTIVA)
        throw new InvalidCredentialsError();
      const claim = await tx.recoveryToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!claim.count) throw new InvalidCredentialsError();
      await tx.recoveryToken.updateMany({
        where: { userId: token.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.usuario.update({
        where: { id: token.userId },
        data: { passwordHash: await hashPassword(password, user!) },
      });
      await tx.session.deleteMany({ where: { userId: token.userId } });
      await tx.mfaChallenge.updateMany({
        where: { userId: token.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (this.audit)
        await this.audit.append(
          {
            subjectId: token.userId,
            action: "PASSWORD_RECOVERY_RESET",
            resource: "identity",
            metadata: { completed: true },
          },
          tx,
        );
      if (tx.notification)
        await tx.notification.create({
          data: {
            userId: token.userId,
            type: "PASSWORD_RECOVERED",
            payload: { completed: true },
          },
        });
      if (this.outbox)
        await this.outbox.enqueue(
          {
            type: "PASSWORD_RECOVERY_RESET",
            aggregateId: String(token.userId),
            payload: { completed: true },
          },
          tx,
        );
      return { reset: true };
    });
    return result;
  }

  async changePassword(
    userId: number,
    current: string,
    next: string,
    currentSessionId?: string,
    code?: string,
  ) {
    const user = await this.users.findByIdForSession(userId);
    if (!user || !(await verifyPassword(current, user.passwordHash)))
      throw new InvalidCredentialsError();
    if (await verifyPassword(next, user.passwordHash))
      throw new ApiException("PASSWORD_UNCHANGED", 400);
    const passwordHash = await hashPassword(next, user);
    if (!this.prisma || !this.outbox)
      throw new Error("Identity dependencies unavailable");
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM RecoveryWriteBarrier WHERE id = 'global' LOCK IN SHARE MODE`;
        const barrier = await tx.recoveryWriteBarrier.findUnique({
          where: { id: "global" },
        });
        if (!barrier || barrier.active)
          throw new ApiException("RECOVERY_WRITE_BARRIER_ACTIVE", 503);
        await tx.$executeRaw`SELECT id FROM Usuario WHERE id = ${userId} FOR UPDATE`;
        const fresh = await tx.usuario.findUnique({
          where: { id: userId },
          select: { estado: true, passwordHash: true },
        });
        if (
          fresh?.estado !== EstadoUsuario.ACTIVA ||
          fresh.passwordHash !== user.passwordHash
        )
          throw new InvalidCredentialsError();
        if (currentSessionId) {
          await tx.$queryRaw`SELECT id FROM Session WHERE id = ${currentSessionId} FOR UPDATE`;
          const session = await tx.session.findUnique({
            where: { id: currentSessionId },
          });
          const now = new Date();
          if (
            !session ||
            session.userId !== userId ||
            session.revokedAt ||
            session.expiresAt <= now ||
            session.absoluteExpiresAt <= now ||
            session.lastActivityAt.getTime() + 30 * 60000 <= now.getTime()
          )
            throw new InvalidCredentialsError();
        }
        await this.mfa?.passwordChangeFactor(tx, userId, code);
        await tx.usuario.update({
          where: { id: userId },
          data: { passwordHash },
        });
        await tx.session.updateMany({
          where: {
            userId,
            ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
          },
          data: { revokedAt: new Date() },
        });
        await tx.recoveryToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.mfaChallenge.updateMany({
          where: { userId, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (this.audit)
          await this.audit.append(
            {
              actorId: userId,
              subjectId: userId,
              action: "PASSWORD_CHANGED",
              resource: "identity",
              metadata: { sessionsRevoked: true },
            },
            tx,
          );
        if (tx.notification)
          await tx.notification.create({
            data: {
              userId,
              type: "PASSWORD_CHANGED",
              payload: { sessionsRevoked: true },
            },
          });
        if (this.outbox)
          await this.outbox.enqueue(
            {
              type: "PASSWORD_CHANGED",
              aggregateId: String(userId),
              payload: { userId },
            },
            tx,
          );
      },
      { isolationLevel: "ReadCommitted" },
    );
    return { changed: true };
  }

  listSessions(userId: number) {
    if (!this.prisma) throw new Error("Identity dependencies unavailable");
    return this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        absoluteExpiresAt: { gt: new Date() },
        lastActivityAt: { gt: new Date(Date.now() - 30 * 60_000) },
      },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        lastActivityAt: true,
        expiresAt: true,
        absoluteExpiresAt: true,
        userAgentSummary: true,
      },
    });
  }
  async sessionStatus(userId: number, id: string) {
    if (!this.prisma) throw new Error("Identity dependencies unavailable");
    const session = await this.prisma.session.findFirst({
      where: { id, userId, revokedAt: null },
      select: { absoluteExpiresAt: true },
    });
    if (!session?.absoluteExpiresAt || session.absoluteExpiresAt <= new Date())
      throw new ApiException("UNAUTHORIZED", 401);
    const now = Date.now();
    return {
      serverAt: new Date(now).toISOString(),
      absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
      idleExpiresAt: new Date(
        Math.min(now + 30 * 60_000, session.absoluteExpiresAt.getTime()),
      ).toISOString(),
    };
  }
  async revokeSession(userId: number, id: string) {
    if (!this.prisma) throw new Error("Identity dependencies unavailable");
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.session.updateMany({
        where: { id, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!result.count) throw new InvalidCredentialsError();
      if (this.audit)
        await this.audit.append(
          {
            actorId: userId,
            subjectId: userId,
            action: "SESSION_REVOKED",
            resource: "session",
            correlationId: id,
          },
          tx,
        );
      if (tx.notification)
        await tx.notification.create({
          data: { userId, type: "SESSION_REVOKED", payload: { sessionId: id } },
        });
      if (this.outbox)
        await this.outbox.enqueue(
          {
            type: "SESSION_REVOKED",
            aggregateId: id,
            payload: { actorId: userId },
          },
          tx,
        );
      return result;
    });
  }
  async revokeOtherSessions(userId: number, currentId: string) {
    if (!this.prisma) throw new Error("Identity dependencies unavailable");
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.session.updateMany({
        where: { userId, id: { not: currentId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (this.audit)
        await this.audit.append(
          {
            actorId: userId,
            subjectId: userId,
            action: "OTHER_SESSIONS_REVOKED",
            resource: "session",
            metadata: { count: result.count },
          },
          tx,
        );
      if (this.outbox)
        await this.outbox.enqueue(
          {
            type: "OTHER_SESSIONS_REVOKED",
            aggregateId: String(userId),
            payload: { actorId: userId, count: result.count },
          },
          tx,
        );
      return result;
    });
  }

  async authenticate(email: string, password: string): Promise<AuthUser> {
    await this.throttle?.assertAccount(email);
    const user = await this.users.findByEmailForAuth(email);

    // Always perform bcrypt work so a missing email is not measurably faster.
    const passwordMatches = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches || user.estado !== EstadoUsuario.ACTIVA) {
      await this.throttle?.failure(email);
      throw new InvalidCredentialsError();
    }

    if (needsArgon2Rehash(user.passwordHash)) {
      // Rehash asynchronously after a successful legacy bcrypt login. The
      // authentication result never depends on this best-effort upgrade.
      void hashPassword(password)
        .then((hash) =>
          this.users.updatePasswordHash(user.id, hash, user.passwordHash),
        )
        .catch(() => undefined);
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

  async completedAuthentication(userId: number) {
    const user = await this.users.findByIdForSession(userId);
    if (!user || user.estado !== EstadoUsuario.ACTIVA)
      throw new InvalidCredentialsError();
    await this.throttle?.success(user.email);
  }
}
