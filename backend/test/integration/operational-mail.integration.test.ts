import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { EmailService } from "../../src/auth/email.service";
import { OutboxService } from "../../src/auth/outbox.service";
import { OutboxDispatcherService } from "../../src/auth/outbox-dispatcher.service";
import { operationalNotification } from "../../src/common/domain/operational-notification";

// Opt-in real SMTP acceptance, isolated from all other integration queues.
const mailpit = process.env.ARES_TEST_MAILPIT_URL;
const url = process.env.DATABASE_URL;
if (
  mailpit &&
  (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(mailpit) ||
    !url ||
    !/^\/ares_closure_mail_(test|ci)$/.test(new URL(url).pathname))
) {
  throw new Error(
    "Real SMTP acceptance needs explicit localhost Mailpit and a dedicated ares_closure_mail_test/ci database",
  );
}
const db = mailpit
  ? new PrismaService(new ConfigService({ DATABASE_URL: url }))
  : undefined;
describe.runIf(!!mailpit)("real operational SMTP retry and privacy", () => {
  afterAll(async () => {
    await db?.$disconnect();
  });
  it("retries a refused real SMTP connection, delivers only a generic notice to Mailpit and preserves one durable receipt", async () => {
    const suffix = randomUUID();
    const email = `mail-${suffix}@example.test`;
    const user = await db!.usuario.create({
      data: {
        codigo: `mail-${suffix}`,
        email,
        passwordHash: "non-login-fixture",
        rol: "PRESTADOR",
        estado: "ACTIVA",
      },
    });
    const notice = await db!.$transaction((tx) =>
      operationalNotification(tx, user.id, "ABSENCE_PROVISIONAL_CREATED", {
        ausenciaId: "synthetic-notice",
        plazoLimiteAt: new Date().toISOString(),
      }),
    );
    const event = await db!.outboxEvent.findFirstOrThrow({
      where: { aggregateId: notice.id },
    });
    const settings = {
      FRONTEND_ORIGIN: "http://localhost:4321",
      OUTBOX_WORKER_ENABLED: true,
      SMTP_ENABLED: true,
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: 1025,
      SMTP_TLS: false,
      SMTP_FROM: "no-reply@ares.local",
      SMTP_TIMEOUT_MS: 1000,
      OUTBOX_ENCRYPTION_KEY: "acceptance-only-mail-encryption-key",
    };
    const config = new ConfigService(settings);
    const outbox = new OutboxService(db!, config as any);
    const unavailable = new EmailService(
      new ConfigService({ ...settings, SMTP_PORT: 9 }) as any,
    );
    expect(await unavailable.connectivity()).toBe("unavailable");
    await new OutboxDispatcherService(
      db!,
      outbox,
      unavailable,
      config as any,
    ).tick();
    const failed = await db!.outboxEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(failed).toMatchObject({
      state: "PENDING",
      attempts: 1,
      processedAt: null,
      lastError: "DELIVERY_FAILED",
      failedAt: null,
    });
    const receipt = await db!.emailDelivery.findUniqueOrThrow({
      where: { outboxEventId: event.id },
    });
    expect(receipt).toMatchObject({
      status: "FAILED",
      errorRedacted: "DELIVERY_FAILED",
      messageId: `<ares-${event.id}@ares.local>`,
    });
    expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(
      event.nextAttemptAt.getTime(),
    );

    const available = new EmailService(config as any);
    expect(await available.connectivity()).toBe("connected");
    const dispatcher = new OutboxDispatcherService(
      db!,
      outbox,
      available,
      config as any,
    );
    await expect
      .poll(
        async () => {
          await dispatcher.tick();
          return (
            await db!.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })
          ).state;
        },
        { timeout: 15000, interval: 500 },
      )
      .toBe("SENT");
    const sent = await db!.emailDelivery.findUniqueOrThrow({
      where: { outboxEventId: event.id },
    });
    expect(sent).toMatchObject({
      id: receipt.id,
      status: "SENT",
      attempts: 2,
      messageId: receipt.messageId,
    });
    expect(sent.sentAt).not.toBeNull();
    const mailbox = await fetch(`${mailpit}/api/v1/messages`);
    expect(mailbox.ok).toBe(true);
    const summary = (await mailbox.json()) as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    const matches = summary.messages.filter((row) =>
      row.To.some((recipient) => recipient.Address === email),
    );
    expect(matches).toHaveLength(1);
    const received = await fetch(`${mailpit}/api/v1/message/${matches[0].ID}`);
    const message = (await received.json()) as {
      Subject: string;
      Text: string;
      MessageID: string;
    };
    expect(message.Subject).toBe("ARES aviso institucional");
    expect(message.Text).toContain(
      "http://localhost:4321/portal/asistencia/ausencias",
    );
    expect(message.Text).not.toMatch(
      /PRIVATE-|archivoId|motivo|token|objectKey|quarantineKey/,
    );
    expect(message.MessageID.replace(/[<>]/g, "")).toBe(
      `ares-${event.id}@ares.local`,
    );
    expect(
      await db!.emailDelivery.count({ where: { outboxEventId: event.id } }),
    ).toBe(1);
  }, 30000);
});
