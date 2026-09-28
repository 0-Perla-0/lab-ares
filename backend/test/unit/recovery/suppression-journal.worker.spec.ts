import { describe, expect, it, vi } from "vitest";

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
      })),
    },
  };
  const storage = {
    putSuppressionJournal: storageError
      ? vi.fn(async () => {
          throw storageError;
        })
      : vi.fn(async () => undefined),
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
});
