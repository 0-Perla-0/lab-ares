import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { PrismaService } from "../../database/prisma.service";
import { Prisma } from "../../generated/prisma/client";
import { ApiException } from "../errors/api.exception";
import { jsonSafe } from "../http/json-safe.interceptor";
import { operationFingerprint } from "./canonical-operation";

@Injectable()
export class DomainTransaction {
  constructor(private readonly prisma: PrismaService) {}
  async run<T>(
    actor: AuthUser,
    key: string,
    operation: object,
    apply: (tx: Prisma.TransactionClient) => Promise<T>,
    authorizeReplay?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<T> {
    const legacyFingerprint = createHash("sha256")
      .update(JSON.stringify(jsonSafe(operation)))
      .digest("hex");
    const fingerprint = operationFingerprint(operation);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM RecoveryWriteBarrier WHERE id = 'global' LOCK IN SHARE MODE`;
            const barrier = await tx.recoveryWriteBarrier.findUnique({
              where: { id: "global" },
            });
            if (!barrier || barrier.active)
              throw new ApiException("RECOVERY_WRITE_BARRIER_ACTIVE", 503);
            await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${actor.id} FOR UPDATE`;
            const fresh = await tx.usuario.findUnique({
              where: { id: actor.id },
            });
            if (
              !fresh ||
              fresh.estado !== "ACTIVA" ||
              fresh.rol !== actor.rol ||
              fresh.areaId !== actor.areaId ||
              fresh.sedeId !== actor.sedeId
            )
              throw new ApiException("UNAUTHORIZED", 401);
            const prior = await tx.domainOperation.findUnique({
              where: { actorId_key: { actorId: actor.id, key } },
            });
            if (prior) {
              if (
                prior.fingerprint !== fingerprint &&
                prior.fingerprint !== legacyFingerprint
              )
                throw new ApiException("IDEMPOTENCY_KEY_REUSED", 409);
              await authorizeReplay?.(tx);
              return prior.response as T;
            }
            const response = JSON.parse(
              JSON.stringify(jsonSafe(await apply(tx))),
            ) as Prisma.InputJsonValue;
            await tx.domainOperation.create({
              data: { actorId: actor.id, key, fingerprint, response },
            });
            return response as T;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            timeout: 30000,
          },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2034", "P2002"].includes(error.code)
        ) {
          if (attempt < 2) continue;
          throw new ApiException("RETRY_REQUIRED", 409);
        }
        throw error;
      }
    }
    throw new ApiException("RETRY_REQUIRED", 409);
  }
}
