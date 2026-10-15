import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../auth/auth-user";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

export function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function lockCalendar(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM RecoveryWriteBarrier WHERE id = 'global' LOCK IN SHARE MODE`;
  const barrier = await tx.recoveryWriteBarrier.findUnique({
    where: { id: "global" },
  });
  if (!barrier || barrier.active)
    throw new ApiException("RECOVERY_WRITE_BARRIER_ACTIVE", 503);
  // Seeded by the migration; a missing mutex fails closed.
  await tx.$queryRaw`SELECT id FROM CalendarRevision WHERE id = 'global' FOR UPDATE`;
  if (!(await tx.calendarRevision.findUnique({ where: { id: "global" } })))
    throw new ApiException("CALENDAR_NOT_READY", 503);
}

@Injectable()
export class AbsenceTransaction {
  constructor(private readonly prisma: PrismaService) {}
  async run(
    actor: AuthUser,
    key: string,
    operation: object,
    apply: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) {
    const fingerprint = hashJson(operation);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await lockCalendar(tx);
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
            const prior = await tx.absenceOperation.findUnique({
              where: { actorId_key: { actorId: actor.id, key } },
            });
            if (prior) {
              if (prior.fingerprint !== fingerprint)
                throw new ApiException("IDEMPOTENCY_KEY_REUSED", 409);
              return prior.response;
            }
            const response = JSON.parse(
              JSON.stringify(await apply(tx)),
            ) as Prisma.InputJsonValue;
            await tx.absenceOperation.create({
              data: { actorId: actor.id, key, fingerprint, response },
            });
            return response;
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
