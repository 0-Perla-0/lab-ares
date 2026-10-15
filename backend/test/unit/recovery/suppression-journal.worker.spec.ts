import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

import { SuppressionJournalWorker } from "../../../src/recovery/suppression-journal.worker";

const config = {
  get: (key: string) => {
    if (key === "SUPPRESSION_JOURNAL_HMAC_SECRET")
      return "test-only-journal-secret-with-32-characters";
    if (key === "SUPPRESSION_JOURNAL_KEY_VERSION") return "v1";
    if (key === "SUPPRESSION_JOURNAL_WORKER_ENABLED") return false;
    return 60_000;
  },
};

function fixture(storageError?: Error) {
  let owner = "";
  const updateMany = vi.fn(async ({ data }: any) => {
    if (data.state === "PROCESSING") owner = data.leaseOwner;
    return { count: 1 };
  });
  const candidate = {
    id: "journal-1",
    sequence: 1,
    attempts: 0,
    state: "PENDING",
    previousHash: null,
    entryHash: "b".repeat(64),
    payloadHash: "a".repeat(64),
    payload: {
      category: "EXPORTACIONES",
      resourceType: "ReporteExportacion",
      resourceFingerprint: "c".repeat(64),
      action: "ELIMINAR",
      policyVersion: 1,
      occurredAt: "2026-09-27T01:00:00.000Z",
    },
  };
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
    recoveryWriteBarrier: {
      findUnique: vi.fn(async () => ({
        active: false,
        runId: null,
        version: 0,
        frozenAt: null,
        snapshotAt: null,
      })),
    },
    suppressionJournalEntry: {
      updateMany,
      findMany: vi.fn(async () => [candidate]),
      findUnique: vi.fn(async () => ({
        ...candidate,
        state: "PROCESSING",
        leaseOwner: owner,
        leaseUntil: new Date(Date.now() + 120000),
      })),
    },
  };
  const storage = {
    putSuppressionJournal: storageError
      ? vi.fn(async (_key: string, _body: Buffer) => {
          throw storageError;
        })
      : vi.fn(async (_key: string, _body: Buffer) => undefined),
    getSuppressionJournal: vi.fn(),
  };
  return {
    prisma,
    storage,
    worker: new SuppressionJournalWorker(
      prisma as any,
      storage as any,
      config as any,
    ),
    updateMany,
  };
}

describe("SuppressionJournalWorker", () => {
  it("claims, signs, appends, and completes one durable entry", async () => {
    const { worker, storage, updateMany } = fixture();
    await expect(worker.tick(1)).resolves.toBe(1);
    expect(storage.putSuppressionJournal).toHaveBeenCalledWith(
      expect.stringMatching(/^entries\/000000000001-/),
      expect.any(Buffer),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: "EXPORTED",
          signature: expect.stringMatching(/^[a-f0-9]{64}$/),
          keyVersion: "v1",
        }),
      }),
    );
  });

  it("schedules a bounded retry without leaking provider errors", async () => {
    const { worker, updateMany } = fixture(new Error("provider secret detail"));
    await expect(worker.tick(1)).resolves.toBe(0);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: "FAILED",
          lastErrorCode: "JOURNAL_EXPORT_FAILED",
        }),
      }),
    );
  });
  it("does not reclaim or append while the barrier is active or missing", async () => {
    for (const barrier of [null, { active: true, version: 2 }]) {
      const h = fixture();
      h.prisma.recoveryWriteBarrier.findUnique.mockResolvedValue(
        barrier as any,
      );
      expect(await h.worker.tick()).toBe(0);
      expect(h.updateMany).not.toHaveBeenCalled();
      expect(h.storage.putSuppressionJournal).not.toHaveBeenCalled();
    }
  });
  it("does not publish or mark failed after a freeze/unfreeze during external append", async () => {
    const h = fixture();
    h.storage.putSuppressionJournal.mockImplementation(async () => {
      h.prisma.recoveryWriteBarrier.findUnique.mockResolvedValue({
        active: false,
        version: 2,
      } as any);
    });
    expect(await h.worker.tick()).toBe(0);
    expect(
      h.updateMany.mock.calls.some(
        ([input]) => input.data.state === "EXPORTED",
      ),
    ).toBe(false);
    expect(
      h.updateMany.mock.calls.some(
        ([input]) =>
          input.data.lastErrorCode === "RECOVERY_WRITE_BARRIER_ACTIVE",
      ),
    ).toBe(false);
  });
  it("never revives an expired owned lease or counts it as exported", async () => {
    const h = fixture();
    const entry = await h.prisma.suppressionJournalEntry.findUnique();
    h.prisma.suppressionJournalEntry.findUnique.mockResolvedValue({
      ...entry,
      leaseOwner: "old-owner",
      leaseUntil: new Date(0),
    });
    expect(await h.worker.tick()).toBe(0);
    expect(h.storage.putSuppressionJournal).not.toHaveBeenCalled();
    expect(
      h.updateMany.mock.calls.some(
        ([input]) => input.data.state === "EXPORTED",
      ),
    ).toBe(false);
  });
  it("reconciles an identical immutable object after a lost append response", async () => {
    const h = fixture();
    h.storage.putSuppressionJournal.mockImplementation(
      async (_key: string, body: Buffer) => {
        h.storage.getSuppressionJournal.mockResolvedValue(
          Readable.from([body]),
        );
        throw Object.assign(new Error("exists"), {
          name: "PreconditionFailed",
        });
      },
    );
    expect(await h.worker.tick()).toBe(1);
  });
  it.each(["different", "oversize"])(
    "rejects %s immutable object without publishing",
    async (mode) => {
      const h = fixture(
        Object.assign(new Error("exists"), { name: "PreconditionFailed" }),
      );
      h.storage.getSuppressionJournal.mockResolvedValue(
        Readable.from([
          mode === "different"
            ? Buffer.from("wrong content")
            : Buffer.alloc(1048577),
        ]),
      );
      expect(await h.worker.tick()).toBe(0);
      expect(h.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastErrorCode:
              mode === "different"
                ? "JOURNAL_APPEND_CONFLICT"
                : "JOURNAL_OBJECT_TOO_LARGE",
          }),
        }),
      );
    },
  );
  it("renews a long append serially and refuses publication after renewal fails", async () => {
    vi.useFakeTimers();
    try {
      const h = fixture();
      let release!: () => void, entered!: () => void;
      const ready = new Promise<void>((r) => {
        entered = r;
      });
      h.storage.putSuppressionJournal.mockImplementation(async () => {
        entered();
        await new Promise<void>((r) => {
          release = r;
        });
      });
      const running = h.worker.tick();
      await ready;
      await vi.advanceTimersByTimeAsync(40000);
      expect(h.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            leaseUntil: { gt: expect.any(Date) },
          }),
          data: { leaseUntil: expect.any(Date) },
        }),
      );
      h.updateMany.mockResolvedValue({ count: 0 });
      await vi.advanceTimersByTimeAsync(40000);
      release();
      expect(await running).toBe(0);
      expect(
        h.updateMany.mock.calls.some(
          ([input]) => input.data.state === "EXPORTED",
        ),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
