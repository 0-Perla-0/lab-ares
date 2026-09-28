import { describe, expect, it, vi } from "vitest";
import { StorageWorker } from "../../../src/storage/storage.worker";

const config = {
  get: (key: string) =>
    key === "STORAGE_WORKER_ENABLED" || key === "STORAGE_SCANNER_ENABLED"
      ? false
      : 5000,
} as never;
const barrier = {
  recoveryWriteBarrier: {
    findUnique: vi.fn().mockResolvedValue({
      active: false,
      runId: null,
      version: 0,
      frozenAt: null,
      snapshotAt: null,
    }),
  },
};
describe("StorageWorker", () => {
  it("claims a due file atomically and processes only the winner", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      ...barrier,
      archivo: {
        updateMany,
        findMany: vi.fn().mockResolvedValue([{ id: "f" }]),
      },
    } as never;
    const storage: any = { analyze: vi.fn().mockResolvedValue({}) };
    const worker = new StorageWorker(prisma, storage, config);
    await expect(worker.processDue(1)).resolves.toBe(1);
    expect(storage.analyze).toHaveBeenCalledWith("f", expect.any(String));
    expect(updateMany).toHaveBeenCalledTimes(3);
  });
  it("does not process when another worker wins the lease", async () => {
    const prisma = {
      ...barrier,
      archivo: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([{ id: "f" }]),
      },
    } as never;
    const storage: any = { analyze: vi.fn() };
    await expect(
      new StorageWorker(prisma, storage, config).processDue(1),
    ).resolves.toBe(0);
    expect(storage.analyze).not.toHaveBeenCalled();
  });
  it("recovers expired leases before claiming", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      ...barrier,
      archivo: { updateMany, findMany: vi.fn().mockResolvedValue([]) },
    } as never;
    await new StorageWorker(
      prisma,
      { analyze: vi.fn() } as never,
      config,
    ).processDue();
    expect(updateMany.mock.calls[0][0].where.status).toBe("ANALIZANDO");
  });
  it("does not claim work while the recovery barrier is active", async () => {
    const findMany = vi.fn();
    const prisma = {
      recoveryWriteBarrier: {
        findUnique: vi.fn().mockResolvedValue({
          active: true,
          runId: "run-1",
          version: 2,
          frozenAt: new Date(),
          snapshotAt: new Date(),
        }),
      },
      archivo: { updateMany: vi.fn(), findMany },
    } as never;
    await expect(
      new StorageWorker(
        prisma,
        { analyze: vi.fn() } as never,
        config,
      ).processDue(),
    ).resolves.toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
