import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { ApiException } from "../../../src/common/errors/api.exception";
import { OutboxDispatcherService } from "../../../src/auth/outbox-dispatcher.service";

function make(fail = false) {
  const event = {
    id: "event",
    type: "OPERATIONAL_NOTIFICATION",
    aggregateId: "notice",
    attempts: 1,
    barrierVersion: 3,
    payload: { notificationId: "notice" },
  };
  const db: any = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    recoveryWriteBarrier: {
      findUnique: vi.fn().mockResolvedValue({ active: false, version: 3 }),
    },
    emailDelivery: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notification: {
      findUnique: vi.fn().mockResolvedValue({
        userId: 4,
        type: "ABSENCE_PROVISIONAL_CREATED",
        payload: { motivo: "private medical text", archivoId: "secret-file" },
      }),
    },
    usuario: {
      findUnique: vi.fn().mockResolvedValue({ email: "subject@example.test" }),
    },
  };
  db.$transaction = vi.fn((effect: any) => effect(db));
  const outbox: any = {
    claim: vi.fn().mockResolvedValue(event),
    decryptPayload: vi.fn(),
    holdsLease: vi.fn().mockResolvedValue(true),
    markSent: vi.fn(),
    markFailure: vi.fn(),
  };
  const email: any = {
    send: fail
      ? vi.fn().mockRejectedValue(new Error("credential SMTP password private"))
      : vi.fn(),
  };
  const service = new OutboxDispatcherService(
    db,
    outbox,
    email,
    new ConfigService({
      FRONTEND_ORIGIN: "https://ares.example.test",
      OUTBOX_WORKER_ENABLED: true,
      SMTP_ENABLED: true,
    }) as any,
  );
  return { db, outbox, email, service };
}
describe("operational mail privacy and retry", () => {
  it("sends a generic portal notice without narratives, IDs, files or tokens", async () => {
    const { service, outbox, email } = make();
    await service.tick();
    expect(email.send).toHaveBeenCalledWith(
      "subject@example.test",
      "ARES aviso institucional",
      expect.stringContaining(
        "https://ares.example.test/portal/asistencia/ausencias",
      ),
      "<ares-event@ares.local>",
    );
    expect(JSON.stringify(email.send.mock.calls)).not.toMatch(
      /private medical|secret-file|notice/,
    );
    expect(outbox.markSent).toHaveBeenCalledOnce();
    expect(outbox.decryptPayload).not.toHaveBeenCalled();
  });
  it("redacts SMTP failure, preserves retry budget and does not report delivery", async () => {
    const { service, outbox } = make(true);
    await service.tick();
    expect(outbox.markFailure).toHaveBeenCalledWith(
      "event",
      expect.any(String),
      "DELIVERY_FAILED",
      5,
      expect.anything(),
    );
    expect(outbox.markSent).not.toHaveBeenCalled();
  });
  it("does not redeliver a durable SENT receipt", async () => {
    const { service, db, email, outbox } = make();
    db.emailDelivery.findUnique.mockResolvedValue({ status: "SENT" });
    await service.tick();
    expect(email.send).not.toHaveBeenCalled();
    expect(outbox.markSent).toHaveBeenCalledOnce();
  });
  it("claims nothing during the governed barrier", async () => {
    const { service, db, outbox } = make();
    db.recoveryWriteBarrier.findUnique.mockResolvedValue({ active: true });
    await service.tick();
    expect(outbox.claim).not.toHaveBeenCalled();
  });
  it("records the receipt and the outbox state in the claimed epoch", async () => {
    const { service, db, outbox } = make();
    await service.tick();
    expect(outbox.markSent).toHaveBeenCalledWith(
      "event",
      expect.any(String),
      db,
    );
    expect(db.emailDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENT" }),
      }),
    );
  });
  it("does not prepare an attempt without a live lease", async () => {
    const { service, db, outbox, email } = make();
    outbox.holdsLease.mockResolvedValue(false);
    await service.tick();
    expect(db.emailDelivery.upsert).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
    expect(outbox.markFailure).not.toHaveBeenCalled();
  });
  it("leaves the event leased when a freeze interrupts the final receipt", async () => {
    const { service, db, outbox, email } = make();
    // Epoch 3 at claim; the barrier moves to 4 while SMTP is in flight.
    db.recoveryWriteBarrier.findUnique
      .mockResolvedValueOnce({ active: false, version: 3 }) // worker check
      .mockResolvedValueOnce({ active: false, version: 3 }) // attempt preparation
      .mockResolvedValue({ active: false, version: 4 });
    await service.tick();
    expect(email.send).toHaveBeenCalledOnce();
    expect(outbox.markSent).not.toHaveBeenCalled();
    expect(outbox.markFailure).not.toHaveBeenCalled();
  });
  it("skips the cycle when a freeze lands between the check and the claim", async () => {
    const { service, outbox, email } = make();
    outbox.claim.mockRejectedValue(
      new ApiException("RECOVERY_WRITE_BARRIER_ACTIVE", 503),
    );
    await service.tick();
    expect(email.send).not.toHaveBeenCalled();
  });
});
