import { createHash, randomBytes } from "node:crypto";
import { visitCode, sameVisitCode } from "./visit-token";
import {
  pilotAllows,
  pilotWhere,
  requirePilot,
} from "../common/domain/operational-pilot";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { AuthUser } from "../auth/auth-user";
import { AuditService } from "../auth/audit.service";
import { Permission } from "../auth/permissions";
import { DomainTransaction } from "../common/domain/domain-transaction";
import {
  organizationalScope,
  requireOrganization,
} from "../common/domain/scope";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../database/prisma.service";
import type { InvitacionVisita } from "../generated/prisma/client";
import { localParts } from "../attendance/attendance-risk";
import {
  visitActionSchema,
  visitCancelSchema,
  visitCreateSchema,
  visitEntrySchema,
  visitQuerySchema,
} from "./visits.schemas";

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transaction: DomainTransaction,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}
  private enabled() {
    if (!this.config.get<boolean>("VISITS_ENABLED", false))
      throw new ApiException("FEATURE_DISABLED", 404);
  }
  private code(id: string, version = "legacy") {
    return visitCode(
      id,
      version,
      this.config.get<string>("VISITS_TOKEN_KEY", ""),
      this.config.get<string>("VISITS_TOKEN_KEYRING", ""),
    );
  }
  private hash(code: string) {
    return createHash("sha256").update(code).digest("hex");
  }
  private serialize(row: InvitacionVisita, actor: AuthUser) {
    const { codigoAcceso: _hash, ...safe } = row;
    let code: string | undefined;
    if (row.anfitrionId === actor.id && !row.evidenceSuppressedAt) {
      try {
        code = this.code(row.id, row.tokenKeyVersion);
        if (this.hash(code) !== row.codigoAcceso) code = undefined;
      } catch (error) {
        if (
          !(error instanceof ApiException) ||
          error.code !== "VISIT_KEY_RETIRED"
        )
          throw error;
      }
    }
    return {
      ...safe,
      estado:
        row.estado === "EMITIDA" && row.validaHasta < new Date()
          ? "VENCIDA"
          : row.estado,
      ...(code ? { code } : {}),
      codeAvailable: !!code,
    };
  }
  create(
    actor: AuthUser,
    key: string,
    input: z.infer<typeof visitCreateSchema>,
  ) {
    this.enabled();
    requirePilot(this.config, input);
    // Idempotency storage contains no raw code. It is derived only for the host after authorization.
    return this.transaction
      .run(actor, key, { action: "VISIT_CREATE", ...input }, async (tx) => {
        requireOrganization(actor, Permission.VISITS_REQUEST, {
          sedeId: input.sedeId,
          areaId: input.areaId ?? null,
        });
        const sede = await tx.sede.findUnique({ where: { id: input.sedeId } });
        const area = input.areaId
          ? await tx.area.findUnique({ where: { id: input.areaId } })
          : null;
        if (
          !sede?.activa ||
          (input.areaId && (!area?.activa || area.sedeId !== sede.id))
        )
          throw new ApiException("VISIT_ASSIGNMENT_INVALID", 400);
        const from = new Date(input.validaDesde),
          until = new Date(input.validaHasta);
        if (
          from >= until ||
          until <= new Date() ||
          until.getTime() - from.getTime() > 86400000 ||
          localParts(from).day !== input.fechaProgramada
        )
          throw new ApiException("VISIT_WINDOW_INVALID", 400);
        const id = randomBytes(15).toString("hex");
        const tokenKeyVersion = this.config.get<string>(
          "VISITS_TOKEN_ACTIVE_VERSION",
          "legacy",
        );
        const row = await tx.invitacionVisita.create({
          data: {
            ...input,
            id,
            anfitrionId: actor.id,
            fechaProgramada: new Date(`${input.fechaProgramada}T00:00:00Z`),
            validaDesde: from,
            validaHasta: until,
            tokenKeyVersion,
            codigoAcceso: this.hash(this.code(id, tokenKeyVersion)),
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            actorRole: actor.rol,
            action: "VISIT_CREATED",
            resource: "visits",
            objectId: id,
            sedeId: row.sedeId,
            areaId: row.areaId ?? undefined,
            metadata: { version: row.version },
          },
          tx,
        );
        const { codigoAcceso: _hash, ...safe } = row;
        return safe;
      })
      .then(async (result) => {
        const row = result as {
          id: string;
          anfitrionId: number;
          tokenKeyVersion?: string;
          evidenceSuppressedAt?: unknown;
        };
        const current = await this.prisma.invitacionVisita.findUnique({
          where: { id: row.id },
        });
        if (current?.evidenceSuppressedAt)
          return this.serialize(current, actor);
        let code: string | undefined;
        try {
          if (row.anfitrionId === actor.id)
            code = this.code(row.id, row.tokenKeyVersion);
          if (code && current && this.hash(code) !== current.codigoAcceso)
            code = undefined;
        } catch (error) {
          if (
            !(error instanceof ApiException) ||
            error.code !== "VISIT_KEY_RETIRED"
          )
            throw error;
        }
        return {
          ...(result as object),
          ...(code ? { code } : {}),
          codeAvailable: !!code,
        };
      });
  }
  async list(actor: AuthUser, query: z.infer<typeof visitQuerySchema>) {
    this.enabled();
    const scope =
      query.mine === "true"
        ? { anfitrionId: actor.id }
        : organizationalScope(actor, Permission.VISITS_MANAGE);
    // Expiry is a computed state; reading does not write across the recovery barrier.
    const expired = query.estado === "VENCIDA";
    const rows = await this.prisma.invitacionVisita.findMany({
      where: {
        ...scope,
        AND: [
          {
            OR: [
              pilotWhere(this.config),
              { estado: "REGISTRADA_ENTRADA" },
              { anfitrionId: actor.id },
            ],
          },
        ],
        ...(query.estado
          ? expired
            ? { estado: "EMITIDA", validaHasta: { lt: new Date() } }
            : {
                estado: query.estado,
                ...(query.estado === "EMITIDA"
                  ? { validaHasta: { gte: new Date() } }
                  : {}),
              }
          : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: query.limit + 1,
    });
    return {
      items: rows
        .slice(0, query.limit)
        .map((row) => this.serialize(row, actor)),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null,
    };
  }
  async check(actor: AuthUser, code: string) {
    this.enabled();
    const row = await this.prisma.invitacionVisita.findUnique({
      where: { codigoAcceso: this.hash(code) },
    });
    if (!row || row.evidenceSuppressedAt || !pilotAllows(this.config, row))
      throw new ApiException("VISIT_NOT_FOUND", 404);
    try {
      if (!sameVisitCode(code, this.code(row.id, row.tokenKeyVersion)))
        throw new ApiException("VISIT_NOT_FOUND", 404);
    } catch {
      throw new ApiException("VISIT_NOT_FOUND", 404);
    }
    requireOrganization(actor, Permission.VISITS_CONTROL, row);
    await this.audit.append({
      actorId: actor.id,
      action: "VISIT_LOOKUP",
      resource: "visits",
      objectId: row.id,
      sedeId: row.sedeId,
      areaId: row.areaId ?? undefined,
    });
    return this.serialize(row, actor);
  }
  act(
    actor: AuthUser,
    id: string,
    key: string,
    action: "ENTRY" | "EXIT" | "CANCEL",
    input:
      | z.infer<typeof visitActionSchema>
      | z.infer<typeof visitEntrySchema>
      | z.infer<typeof visitCancelSchema>,
  ) {
    this.enabled();
    return this.transaction.run(
      actor,
      key,
      { action: `VISIT_${action}`, id, ...input },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM InvitacionVisita WHERE id = ${id} FOR UPDATE`;
        const row = await tx.invitacionVisita.findUnique({ where: { id } });
        if (!row) throw new ApiException("VISIT_NOT_FOUND", 404);
        if (row.evidenceSuppressedAt)
          throw new ApiException("VISIT_EVIDENCE_SUPPRESSED", 409);
        if (action === "ENTRY") {
          requirePilot(this.config, row);
          if (
            this.hash(this.code(row.id, row.tokenKeyVersion)) !==
            row.codigoAcceso
          )
            throw new ApiException("VISIT_KEY_UNAVAILABLE", 409);
        }
        if (action !== "CANCEL" || row.anfitrionId !== actor.id)
          requireOrganization(
            actor,
            action === "CANCEL"
              ? Permission.VISITS_MANAGE
              : Permission.VISITS_CONTROL,
            row,
          );
        if (row.version !== input.version)
          throw new ApiException("VISIT_VERSION_CHANGED", 409);
        const now = new Date();
        if (
          (action === "ENTRY" &&
            (row.estado !== "EMITIDA" ||
              row.validaDesde > now ||
              row.validaHasta < now)) ||
          (action === "EXIT" && row.estado !== "REGISTRADA_ENTRADA") ||
          (action === "CANCEL" && row.estado !== "EMITIDA")
        )
          throw new ApiException("VISIT_STATE_INVALID", 409);
        if (
          action === "ENTRY" &&
          (!("identificacionVerificada" in input) ||
            input.identificacionVerificada !== true)
        )
          throw new ApiException("VISIT_IDENTITY_REQUIRED", 400);
        const updated = await tx.invitacionVisita.update({
          where: { id },
          data: {
            version: { increment: 1 },
            observaciones: input.observaciones,
            ...(action === "ENTRY"
              ? {
                  estado: "REGISTRADA_ENTRADA",
                  entradaAt: now,
                  registradoEntradaPorId: actor.id,
                }
              : action === "EXIT"
                ? {
                    estado: "REGISTRADA_SALIDA",
                    salidaAt: now,
                    registradoSalidaPorId: actor.id,
                  }
                : { estado: "CANCELADA" }),
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            actorRole: actor.rol,
            action: `VISIT_${action}`,
            resource: "visits",
            objectId: id,
            sedeId: row.sedeId,
            areaId: row.areaId ?? undefined,
            reason: "reason" in input ? input.reason : undefined,
            metadata: {
              version: updated.version,
              identityVerified: action === "ENTRY",
            },
          },
          tx,
        );
        const { codigoAcceso: _hash, ...safe } = updated;
        return safe;
      },
    );
  }
}
