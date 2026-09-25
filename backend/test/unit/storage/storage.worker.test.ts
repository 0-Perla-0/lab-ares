import { describe, expect, it, vi } from "vitest";
import { StorageWorker } from "../../../src/storage/storage.worker";

const config = { get: (key: string) => key === "STORAGE_WORKER_ENABLED" || key === "STORAGE_SCANNER_ENABLED" ? false : 5000 } as never;
describe("StorageWorker", () => {
  it("claims a due file atomically and processes only the winner", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { archivo: { updateMany, findMany: vi.fn().mockResolvedValue([{ id: "f" }]) } } as never;
    const storage: any = { analyze: vi.fn().mockResolvedValue({}) };
    const worker = new StorageWorker(prisma, storage, config);
    await expect(worker.processDue(1)).resolves.toBe(1);
    expect(storage.analyze).toHaveBeenCalledWith("f", expect.any(String));
    expect(updateMany).toHaveBeenCalledTimes(3);
  });
  it("does not process when another worker wins the lease", async () => {
    const prisma = { archivo: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findMany: vi.fn().mockResolvedValue([{ id: "f" }]) } } as never;
    const storage: any = { analyze: vi.fn() };
    await expect(new StorageWorker(prisma, storage, config).processDue(1)).resolves.toBe(0);
    expect(storage.analyze).not.toHaveBeenCalled();
  });
  it("recovers expired leases before claiming", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { archivo: { updateMany, findMany: vi.fn().mockResolvedValue([]) } } as never;
    await new StorageWorker(prisma, { analyze: vi.fn() } as never, config).processDue();
    expect(updateMany.mock.calls[0][0].where.status).toBe("ANALIZANDO");
  });
});
