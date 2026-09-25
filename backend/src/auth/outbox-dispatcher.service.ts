import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database/prisma.service";
import type { Environment } from "../config/environment";
import { OutboxService } from "./outbox.service";
import { EmailService } from "./email.service";

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout; private running = false; private readonly enabled: boolean;
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxService, private readonly email: EmailService, config: ConfigService<Environment, true>) { this.enabled = config.get("OUTBOX_WORKER_ENABLED", { infer: true }) && config.get("SMTP_ENABLED", { infer: true }); }
  onModuleInit() { if (this.enabled) this.timer = setInterval(() => void this.tick(), 5000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async tick() {
    if (!this.enabled || this.running) return; this.running = true; const owner = `${process.pid}-${Math.random().toString(36).slice(2)}`;
    try { const event = await this.outbox.claim(owner); if (!event) return; const messageId = `<ares-${event.id}@ares.local>`;
      try { const existing = await this.prisma.emailDelivery.findUnique({ where: { outboxEventId: event.id } }); if (existing?.status === "SENT") { await this.outbox.markSent(event.id, owner); return; }
        await this.prisma.emailDelivery.upsert({ where: { outboxEventId: event.id }, create: { outboxEventId: event.id, status: "SENDING", attempts: event.attempts, messageId, leaseOwner: owner, leaseUntil: new Date(Date.now() + 60000) }, update: { status: "SENDING", attempts: event.attempts, leaseOwner: owner, leaseUntil: new Date(Date.now() + 60000) } });
        const payload = this.outbox.decryptPayload(event.payload); const handlers: Record<string, (p: any) => Promise<void>> = {
          PASSWORD_RECOVERY_REQUESTED: async p => { if (!p.email || !p.token) throw new Error("MISSING_RECIPIENT"); await this.email.send(p.email, "ARES recuperación de contraseña", `Usa este token para recuperar tu contraseña: ${p.token}`, messageId); },
          PASSWORD_CHANGED: async p => this.sendUser(p.userId, event.type, messageId), PASSWORD_RECOVERY_RESET: async p => this.sendUser(p.userId ?? event.aggregateId, event.type, messageId), SESSION_REVOKED: async p => this.sendUser(p.actorId, event.type, messageId), MFA_ENABLED: async p => this.sendUser(p.userId ?? event.aggregateId, event.type, messageId), MFA_DISABLED: async p => this.sendUser(p.userId ?? event.aggregateId, event.type, messageId),
          INVITATION_CREATED: async p => { if (!p.email || !p.token) throw new Error("MISSING_RECIPIENT"); await this.email.send(p.email, "ARES invitación", `Token de invitación: ${p.token}`, messageId); },
        }; const handler = handlers[event.type]; if (!handler) throw new Error("UNKNOWN_EVENT"); await handler(payload);
        await this.prisma.emailDelivery.updateMany({ where: { outboxEventId: event.id, status: "SENDING", leaseOwner: owner }, data: { status: "SENT", sentAt: new Date(), leaseOwner: null, leaseUntil: null } }); await this.outbox.markSent(event.id, owner);
      } catch (error) { const safe = error instanceof Error && ["UNKNOWN_EVENT", "MISSING_RECIPIENT"].includes(error.message) ? error.message : "DELIVERY_FAILED"; await this.prisma.emailDelivery.updateMany({ where: { outboxEventId: event.id, leaseOwner: owner }, data: { status: "FAILED", errorRedacted: safe, leaseOwner: null, leaseUntil: null } }).catch(() => undefined); await this.outbox.markFailure(event.id, owner, safe, safe === "UNKNOWN_EVENT" || safe === "MISSING_RECIPIENT" ? 1 : 5); }
    } finally { this.running = false; }
  }
  private async sendUser(id: any, type: string, messageId: string) { const user = await this.prisma.usuario.findUnique({ where: { id: Number(id) }, select: { email: true } }); if (!user?.email) throw new Error("MISSING_RECIPIENT"); await this.email.send(user.email, `ARES ${type}`, `Se registró el evento ${type}.`, messageId); }
}
