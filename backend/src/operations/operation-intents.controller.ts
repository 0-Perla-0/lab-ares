import { Controller, Get, Param, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { ApiException } from "../common/errors/api.exception";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { PrismaService } from "../database/prisma.service";

@Controller("operation-intents")
export class OperationIntentsController {
  constructor(private readonly db: PrismaService) {}
  @Get(":key")
  async status(
    @Req() req: Request,
    @Param(
      "key",
      new ZodValidationPipe(z.string().regex(/^[A-Za-z0-9._:-]{16,128}$/)),
    )
    key: string,
  ) {
    const actor = getAuthenticatedUser(req);
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${actor.id} LOCK IN SHARE MODE`;
        const fresh = await tx.usuario.findUnique({ where: { id: actor.id } });
        if (
          !fresh ||
          fresh.estado !== "ACTIVA" ||
          fresh.rol !== actor.rol ||
          fresh.sedeId !== actor.sedeId ||
          fresh.areaId !== actor.areaId
        )
          throw new ApiException("UNAUTHORIZED", 401);
        // Explicit allowlist; only self-owned commit metadata. No stored response,
        // fingerprint, resource identifiers, narratives or factors ever leave here.
        const receipts = await tx.$queryRaw<
          { source: string; committedAt: Date }[]
        >`
        SELECT 'domain' AS source, createdAt AS committedAt FROM DomainOperation WHERE actorId = ${actor.id} AND \`key\` = ${key}
        UNION ALL SELECT 'attendance', createdAt FROM AsistenciaSolicitud WHERE actorId = ${actor.id} AND \`key\` = ${key}
        UNION ALL SELECT 'absence', createdAt FROM AbsenceOperation WHERE actorId = ${actor.id} AND \`key\` = ${key}
        UNION ALL SELECT 'retention', createdAt FROM OperacionRetencion WHERE actorId = ${actor.id} AND \`key\` = ${key} AND response IS NOT NULL
        UNION ALL SELECT 'printing', createdAt FROM OperacionImpresion3D WHERE actorId = ${actor.id} AND \`key\` = ${key}
        UNION ALL SELECT 'recovery', createdAt FROM RecoveryOperation WHERE actorId = ${actor.id} AND \`key\` = ${key} AND response IS NOT NULL
      `;
        return {
          data: {
            state: receipts.length ? "COMMITTED" : "UNCONFIRMED",
            receipts,
            semantics:
              "Absence of a committed receipt does not prove cancellation or exclude an in-flight transaction. Retry the identical operation to recover its currently authorized response. No automatic replay.",
          },
        };
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
}
