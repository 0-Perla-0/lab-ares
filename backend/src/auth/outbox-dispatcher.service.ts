import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database/prisma.service";
import type { Environment } from "../config/environment";
import { OutboxService } from "./outbox.service";
import { EmailService } from "./email.service";
import { workersMayMutate } from "../recovery/barrier";
import { observeWorker } from "../common/domain/worker-heartbeat";
import { notificationLink } from "../common/domain/operational-notification";

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly enabled: boolean;
  private readonly origin: string;
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly email: EmailService,
    config: ConfigService<Environment, true>,
  ) {
    this.origin = config.get("FRONTEND_ORIGIN", { infer: true });
    this.enabled =
      config.get("OUTBOX_WORKER_ENABLED", { infer: true }) &&
      config.get("SMTP_ENABLED", { infer: true });
  }
  onModuleInit() {
    if (this.enabled)
      this.timer = setInterval(() => {
        if (!this.running)
          void observeWorker(this.prisma, "outbox", () => this.tick());
      }, 5000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (!this.enabled || this.running) return;
    this.running = true;
    const owner = `${process.pid}-${Math.random().toString(36).slice(2)}`;
    try {
      if (!(await workersMayMutate(this.prisma))) return;
      const event = await this.outbox.claim(owner);
      if (!event) return;
      const messageId = `<ares-${event.id}@ares.local>`;
      try {
        const existing = await this.prisma.emailDelivery.findUnique({
          where: { outboxEventId: event.id },
        });
        if (existing?.status === "SENT") {
          await this.outbox.markSent(event.id, owner);
          return;
        }
        await this.prisma.emailDelivery.upsert({
          where: { outboxEventId: event.id },
          create: {
            outboxEventId: event.id,
            status: "SENDING",
            attempts: event.attempts,
            messageId,
            leaseOwner: owner,
            leaseUntil: new Date(Date.now() + 60000),
          },
          update: {
            status: "SENDING",
            attempts: event.attempts,
            leaseOwner: owner,
            leaseUntil: new Date(Date.now() + 60000),
          },
        });
        const payload =
          event.type === "OPERATIONAL_NOTIFICATION"
            ? {}
            : this.outbox.decryptPayload(event.payload);
        const handlers: Record<string, (p: any) => Promise<void>> = {
          IDENTITY_RECOVERY_PREVIOUS_ADDRESS: async (p) => {
            if (typeof p.email !== "string")
              throw new Error("MISSING_RECIPIENT");
            await this.email.send(
              p.email,
              "ARES recuperación administrativa",
              "Una autoridad institucional verificó tu identidad y solicitó recuperar tu acceso. Si no reconoces esta operación, contacta al responsable institucional.",
              messageId,
            );
          },
          OPERATIONAL_NOTIFICATION: async () => {
            const notification = await this.prisma.notification.findUnique({
              where: { id: event.aggregateId },
              select: { userId: true, type: true },
            });
            if (!notification) throw new Error("MISSING_RECIPIENT");
            const user = await this.prisma.usuario.findUnique({
              where: { id: notification.userId },
              select: { email: true },
            });
            if (!user) throw new Error("MISSING_RECIPIENT");
            await this.email.send(
              user.email,
              "ARES aviso institucional",
              `Tienes una actualización institucional. Consulta los detalles en ${this.origin}${notificationLink(notification.type)}`,
              messageId,
            );
          },
          PASSWORD_RECOVERY_REQUESTED: async (p) => {
            if (!p.email || !p.token) throw new Error("MISSING_RECIPIENT");
            await this.email.send(
              p.email,
              "ARES recuperación de contraseña",
              `Restablece tu contraseña: ${this.origin}/recuperar?token=${encodeURIComponent(p.token)}`,
              messageId,
            );
          },
          PASSWORD_CHANGED: async (p) =>
            this.sendUser(p.userId, event.type, messageId),
          ACCOUNT_CHANGED: async (p) =>
            this.sendUser(p.userId, event.type, messageId),
          PASSWORD_RECOVERY_RESET: async (p) =>
            this.sendUser(p.userId ?? event.aggregateId, event.type, messageId),
          SESSION_REVOKED: async (p) =>
            this.sendUser(p.actorId, event.type, messageId),
          OTHER_SESSIONS_REVOKED: async (p) =>
            this.sendUser(p.actorId, event.type, messageId),
          INVITATION_ACCEPTED: async () =>
            this.sendUser(event.aggregateId, event.type, messageId),
          INVITATION_REVOKED: async () => {
            const invitation = await this.prisma.invitation.findUnique({
              where: { id: event.aggregateId },
              select: { targetEmail: true },
            });
            if (!invitation) throw new Error("MISSING_RECIPIENT");
            await this.email.send(
              invitation.targetEmail,
              "ARES invitación revocada",
              "Tu invitación ya no está disponible. Contacta al responsable institucional.",
              messageId,
            );
          },
          MFA_ENABLED: async (p) =>
            this.sendUser(p.userId ?? event.aggregateId, event.type, messageId),
          MFA_DISABLED: async (p) =>
            this.sendUser(p.userId ?? event.aggregateId, event.type, messageId),
          INVITATION_CREATED: async (p) => {
            if (!p.targetEmail || !p.token)
              throw new Error("MISSING_RECIPIENT");
            await this.email.send(
              p.targetEmail,
              "ARES invitación",
              `Activa tu cuenta: ${this.origin}/invitacion?token=${encodeURIComponent(p.token)}`,
              messageId,
            );
          },
        };
        const handler = handlers[event.type];
        if (!handler) throw new Error("UNKNOWN_EVENT");
        await handler(payload);
        await this.prisma.emailDelivery.updateMany({
          where: {
            outboxEventId: event.id,
            status: "SENDING",
            leaseOwner: owner,
          },
          data: {
            status: "SENT",
            sentAt: new Date(),
            leaseOwner: null,
            leaseUntil: null,
          },
        });
        await this.outbox.markSent(event.id, owner);
      } catch (error) {
        const safe =
          error instanceof Error &&
          ["UNKNOWN_EVENT", "MISSING_RECIPIENT"].includes(error.message)
            ? error.message
            : "DELIVERY_FAILED";
        await this.prisma.emailDelivery
          .updateMany({
            where: { outboxEventId: event.id, leaseOwner: owner },
            data: {
              status: "FAILED",
              errorRedacted: safe,
              leaseOwner: null,
              leaseUntil: null,
            },
          })
          .catch(() => undefined);
        await this.outbox.markFailure(
          event.id,
          owner,
          safe,
          safe === "UNKNOWN_EVENT" || safe === "MISSING_RECIPIENT" ? 1 : 5,
        );
      }
    } finally {
      this.running = false;
    }
  }
  private async sendUser(id: any, type: string, messageId: string) {
    const user = await this.prisma.usuario.findUnique({
      where: { id: Number(id) },
      select: { email: true },
    });
    if (!user?.email) throw new Error("MISSING_RECIPIENT");
    await this.email.send(
      user.email,
      `ARES ${type}`,
      `Se registró el evento ${type}.`,
      messageId,
    );
  }
}
