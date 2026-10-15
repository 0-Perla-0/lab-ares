import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import {
  QueueMonitorWorker,
  parseQueueSlos,
} from "../../../src/operations/queue-monitor.worker";
function make() {
  const now = new Date("2026-10-12T12:00:00Z");
  const tx: any = {
    $executeRaw: vi.fn(),
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          queue: "outbox",
          depth: 1n,
          oldest: new Date(now.getTime() - 600000),
        },
      ]),
    recoveryWriteBarrier: {
      findUnique: vi.fn().mockResolvedValue({ active: false }),
    },
    workerHeartbeat: { upsert: vi.fn() },
    operationalAlert: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "alert" }),
    },
  };
  const db: any = { $transaction: vi.fn((fn) => fn(tx)) },
    audit: any = { append: vi.fn() };
  const config = new ConfigService({
    OPERATIONS_QUEUE_SLO_JSON: '{"outbox":300}',
  });
  return {
    now,
    tx,
    db,
    audit,
    worker: new QueueMonitorWorker(db, config, audit),
  };
}
describe("explicit queue SLO monitoring", () => {
  it("has no invented thresholds and rejects unknown queues or invalid seconds", () => {
    expect(parseQueueSlos("")).toEqual({});
    expect(parseQueueSlos("{}")).toEqual({});
    expect(
      parseQueueSlos('{"retention":300,"suppressionJournal":600}'),
    ).toEqual({ retention: 300, suppressionJournal: 600 });
    expect(() => parseQueueSlos('{"outbox":0}')).toThrow();
    expect(() => parseQueueSlos('{"unknown":300}')).toThrow();
  });
  it("creates a durable alert and audit without payloads or delivery claims", async () => {
    const h = make();
    expect(await h.worker.monitor(h.now)).toBe(1);
    expect(h.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "SYSTEM",
        action: "QUEUE_BACKLOG_SLO_EXCEEDED",
      }),
      h.tx,
    );
    expect(JSON.stringify(h.tx.operationalAlert.create.mock.calls)).not.toMatch(
      /password|token|notificationId/,
    );
  });
  it("coalesces open/acknowledged alerts instead of creating a notification storm", async () => {
    const h = make();
    h.tx.operationalAlert.findFirst.mockResolvedValue({ id: "existing" });
    expect(await h.worker.monitor(h.now)).toBe(0);
    expect(h.tx.operationalAlert.create).not.toHaveBeenCalled();
  });
  it("fails closed during recovery before queue scans and alert writes", async () => {
    const h = make();
    h.tx.recoveryWriteBarrier.findUnique.mockResolvedValue({ active: true });
    expect(await h.worker.monitor(h.now)).toBe(0);
    expect(h.tx.$queryRaw).toHaveBeenCalledOnce();
    expect(h.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it.each(["retention", "suppressionJournal"])(
    "monitors explicitly configured %s backlog",
    async (queue) => {
      const h = make();
      h.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValue([
          { queue, depth: 2n, oldest: new Date(h.now.getTime() - 600000) },
        ]);
      const worker = new QueueMonitorWorker(
        h.db,
        new ConfigService({
          OPERATIONS_QUEUE_SLO_JSON: JSON.stringify({ [queue]: 300 }),
        }),
        h.audit,
      );
      expect(await worker.monitor(h.now)).toBe(1);
      expect(h.tx.operationalAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source: `queue:${queue}` }),
        }),
      );
    },
  );
});
