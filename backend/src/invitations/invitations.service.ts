import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../common/errors/api.exception";
import { OutboxService } from "../auth/outbox.service";
import { EstadoUsuario } from "../generated/prisma/enums";
import { RolUsuario } from "../generated/prisma/enums";
import type { AuthUser } from "../auth/auth-user";
import { UsersPolicy } from "../users/users.policy";
import { AuditService } from "../auth/audit.service";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxService, private readonly usersPolicy: UsersPolicy, private readonly audit: AuditService) {}
  async create(input: { targetEmail: string; role: RolUsuario; actor: AuthUser; expiresAt?: Date; sedeId?: number|null; areaId?: number|null; turnoId?: number|null }) {
    const expiresAt = input.expiresAt ?? new Date(Date.now() + 72 * 60 * 60_000);
    if (expiresAt <= new Date() || expiresAt > new Date(Date.now() + 72 * 60 * 60_000)) throw new ApiException("INVITATION_EXPIRY_INVALID", 400);
    this.usersPolicy.requireCreation(input.actor, { rol: input.role, sedeId: input.sedeId ?? null, areaId: input.areaId ?? null });
    if (input.areaId) { const area = await this.prisma.area.findUnique({ where: { id: input.areaId } }); if (!area || area.sedeId !== input.sedeId) throw new ApiException("INVITATION_PLACEMENT_INVALID", 400); }
    if (input.turnoId) { const turno = await this.prisma.turno.findUnique({ where: { id: input.turnoId } }); if (!turno || turno.areaId !== input.areaId) throw new ApiException("INVITATION_PLACEMENT_INVALID", 400); }
    const raw = randomBytes(32).toString("base64url");
    let invitation; try { invitation = await this.prisma.$transaction(async (tx) => { const created = await tx.invitation.create({ data: { tokenHash: hashToken(raw), targetEmail: input.targetEmail.toLowerCase(), role: input.role, createdById: input.actor.id, expiresAt, sedeId: input.sedeId, areaId: input.areaId, turnoId: input.turnoId } }); await this.outbox.enqueue({ type: "INVITATION_CREATED", aggregateId: created.id, payload: { token: raw, targetEmail: created.targetEmail } }, tx); await this.audit.append({ actorId: input.actor.id, subjectId: input.actor.id, action: "INVITATION_CREATED", resource: "invitation", metadata: { targetEmail: created.targetEmail } }, tx); return created; }); } catch (error: any) { if (error?.code === "P2002") throw new ApiException("INVITATION_DUPLICATE", 409); throw error; }
    return { id: invitation.id, targetEmail: invitation.targetEmail, expiresAt: invitation.expiresAt };
  }
  list() { return this.prisma.invitation.findMany({ orderBy: { createdAt: "desc" }, select: { id:true,targetEmail:true,role:true,expiresAt:true,usedAt:true,revokedAt:true,createdAt:true } }); }
  get(token: string) { return this.prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) }, select: { id:true,targetEmail:true,role:true,expiresAt:true,usedAt:true,revokedAt:true } }); }
  async accept(token: string, passwordHash: string, codigo: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const found = await tx.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!found || found.usedAt || found.revokedAt || found.expiresAt <= new Date()) throw new ApiException("INVITATION_INVALID", 400);
      const claimed = await tx.invitation.updateMany({ where: { id: found.id, usedAt: null, revokedAt: null }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new ApiException("INVITATION_ALREADY_USED", 409);
      const user = await tx.usuario.create({ data: { codigo, email: found.targetEmail, passwordHash, rol: found.role, estado: EstadoUsuario.ACTIVA, sedeId: found.sedeId, areaId: found.areaId, turnoId: found.turnoId } });
      await tx.invitation.update({ where: { id: found.id }, data: { acceptedById: user.id, targetUserId: user.id } });
      await this.audit.append({ subjectId: user.id, action: "INVITATION_ACCEPTED", resource: "invitation", correlationId: found.id, metadata: { accepted: true } }, tx);
      await this.outbox.enqueue({ type: "INVITATION_ACCEPTED", aggregateId: String(user.id), payload: { accepted: true } }, tx);
      return { id: user.id, email: user.email };
    });
    return result;
  }
  async revoke(id: string, actor: AuthUser) { const invitation = await this.prisma.invitation.findUnique({ where: { id }, select: { role: true, sedeId: true, areaId: true } }); if (!invitation) throw new ApiException("INVITATION_NOT_FOUND", 404); this.usersPolicy.requireCreation(actor, { rol: invitation.role, sedeId: invitation.sedeId, areaId: invitation.areaId }); return this.prisma.$transaction(async (tx) => { const result = await tx.invitation.updateMany({ where: { id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } }); if (result.count) { await this.audit.append({ actorId: actor.id, action: "INVITATION_REVOKED", resource: "invitation", correlationId: id, metadata: { revoked: true } }, tx); await this.outbox.enqueue({ type: "INVITATION_REVOKED", aggregateId: id, payload: { revoked: true } }, tx); } return result; }); }
}
