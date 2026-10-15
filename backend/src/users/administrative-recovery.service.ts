import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { AuthUser } from "../auth/auth-user";
import { AuditService } from "../auth/audit.service";
import { OutboxService } from "../auth/outbox.service";
import { PrismaService } from "../database/prisma.service";
import { DomainTransaction } from "../common/domain/domain-transaction";
import { operationalNotification } from "../common/domain/operational-notification";
import { ApiException } from "../common/errors/api.exception";
import { EstadoUsuario } from "../generated/prisma/enums";
import { UsersPolicy } from "./users.policy";

export const administrativeRecoverySchema = z
  .object({
    identityVerified: z.literal(true),
    ticket: z.string().trim().min(3).max(100),
    reason: z.string().trim().min(10).max(500),
    email: z
      .email()
      .max(191)
      .transform((value) => value.trim().toLowerCase())
      .optional(),
    resetMfa: z.boolean().default(false),
  })
  .strict();

@Injectable()
export class AdministrativeRecoveryService {
  constructor(
    private readonly db: PrismaService,
    private readonly policy: UsersPolicy,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}
  async recover(
    actor: AuthUser,
    userId: number,
    key: string,
    input: z.infer<typeof administrativeRecoverySchema>,
  ) {
    if (actor.id === userId)
      throw new ApiException("SELF_RECOVERY_NOT_ALLOWED", 403);
    return new DomainTransaction(this.db).run(
      actor,
      key,
      { action: "ADMINISTRATIVE_RECOVERY", userId, ...input },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${userId} FOR UPDATE`;
        const user = await tx.usuario.findUnique({ where: { id: userId } });
        if (!user) throw new ApiException("USER_NOT_FOUND", 404);
        this.policy.requireRecovery(actor, user);
        if (user.estado !== EstadoUsuario.ACTIVA)
          throw new ApiException("RECOVERY_ACCOUNT_NOT_ACTIVE", 409);
        if (input.email && input.email !== user.email)
          await tx.usuario.update({
            where: { id: userId },
            data: { email: input.email },
          });
        const now = new Date();
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.recoveryToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now },
        });
        await tx.mfaChallenge.updateMany({
          where: { userId, consumedAt: null },
          data: { consumedAt: now },
        });
        if (input.resetMfa) {
          await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
          await tx.userMfa.deleteMany({ where: { userId } });
        }
        const raw = randomBytes(32).toString("base64url");
        const token = await tx.recoveryToken.create({
          data: {
            userId,
            tokenHash: createHash("sha256").update(raw).digest("hex"),
            expiresAt: new Date(now.getTime() + 30 * 60_000),
          },
        });
        await this.outbox.enqueue(
          {
            type: "PASSWORD_RECOVERY_REQUESTED",
            aggregateId: token.id,
            payload: { email: input.email ?? user.email, token: raw },
          },
          tx,
        );
        // Alert the old address as well, without revealing the replacement address.
        if (input.email && input.email !== user.email)
          await this.outbox.enqueue(
            {
              type: "IDENTITY_RECOVERY_PREVIOUS_ADDRESS",
              aggregateId: String(userId),
              payload: { email: user.email },
            },
            tx,
          );
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: userId,
            actorRole: actor.rol,
            action: "IDENTITY_ADMINISTRATIVE_RECOVERY",
            module: "IDENTITY",
            resource: "identity",
            metadata: {
              ticket: input.ticket,
              reason: input.reason,
              identityVerified: true,
              emailChanged: !!input.email && input.email !== user.email,
              mfaReset: input.resetMfa,
              sessionsRevoked: true,
            },
          },
          tx,
        );
        await operationalNotification(
          tx,
          userId,
          input.resetMfa
            ? "MFA_ADMINISTRATIVE_RECOVERY"
            : "IDENTITY_ADMINISTRATIVE_RECOVERY",
          { sessionsRevoked: true, mfaReset: input.resetMfa },
        );
        return {
          accepted: true,
          userId,
          sessionsRevoked: true,
          mfaReset: input.resetMfa,
        };
      },
    );
  }
}
