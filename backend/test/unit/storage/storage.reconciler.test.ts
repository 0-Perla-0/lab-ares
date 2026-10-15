import { describe, expect, it, vi } from "vitest";

import { StorageReconciler } from "../../../src/storage/storage.reconciler";

function fixture() {
  const old = new Date(Date.now() - 60_000);
  const prisma = {
    archivo: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "f",
            objectKey: "file-key",
            quarantineKey: "file-key",
            status: "DISPONIBLE",
            createdAt: old,
            updatedAt: old,
          },
        ])
        .mockResolvedValueOnce([
          { objectKey: "file-key", quarantineKey: "file-key" },
        ]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditManifest: {
      findMany: vi.fn().mockResolvedValue([{ storageRef: "audit-anchor" }]),
    },
    recoveryWriteBarrier: {
      findUnique: vi.fn().mockResolvedValue({
        active: true,
        runId: "recovery-1",
        version: 7,
        frozenAt: old,
        snapshotAt: old,
      }),
    },
  };
  const storage = {
    head: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    copy: vi.fn(),
    delete: vi.fn(),
    list: vi
      .fn()
      .mockResolvedValueOnce({
        objects: [{ key: "audit-anchor", lastModified: old }],
      })
      .mockResolvedValueOnce({ objects: [] }),
  };
  const reconciler = new StorageReconciler(
    prisma as never,
    storage as never,
    { get: () => 1_000 } as never,
  );
  return { storage, reconciler, prisma };
}

describe("StorageReconciler", () => {
  it("keeps preview side-effect free and protects audit anchors", async () => {
    const { storage, reconciler } = fixture();
    const preview = await reconciler.preview();
    expect(preview).toMatchObject({ proposed: 1, counts: { PROMOTE: 1 } });
    expect(preview.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storage.copy).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("executes only the exact preview under the owning barrier", async () => {
    const first = fixture();
    const preview = await first.reconciler.preview();
    const second = fixture();
    const result = await second.reconciler.execute(
      100,
      preview.planHash!,
      "recovery-1",
      7,
    );
    expect(result.repaired).toBe(1);
    expect(second.storage.copy).toHaveBeenCalled();
    expect(second.storage.delete).not.toHaveBeenCalled();
  });

  it("refuses a stale plan before applying side effects", async () => {
    const { storage, reconciler } = fixture();
    await expect(
      reconciler.execute(100, "0".repeat(64), "recovery-1", 7),
    ).rejects.toThrow("RECONCILIATION_PREVIEW_STALE");
    expect(storage.copy).not.toHaveBeenCalled();
  });
  it("refuses an exact plan containing unlogged deletion before any repair", async () => {
    const planned = fixture();
    planned.storage.list
      .mockReset()
      .mockResolvedValueOnce({
        objects: [{ key: "private-orphan", lastModified: new Date(0) }],
      })
      .mockResolvedValueOnce({ objects: [] });
    const preview = await planned.reconciler.preview();
    expect(preview.counts).toMatchObject({ DELETE_ORPHAN: 1, PROMOTE: 1 });
    const current = fixture();
    current.storage.list
      .mockReset()
      .mockResolvedValueOnce({
        objects: [{ key: "private-orphan", lastModified: new Date(0) }],
      })
      .mockResolvedValueOnce({ objects: [] });
    await expect(
      current.reconciler.execute(100, preview.planHash!, "recovery-1", 7),
    ).rejects.toMatchObject({ code: "OBJECT_DELETION_PROTOCOL_REQUIRED" });
    expect(current.storage.copy).not.toHaveBeenCalled();
    expect(current.storage.delete).not.toHaveBeenCalled();
  });
});
