import { describe, expect, it, vi } from "vitest";
import { StorageReconciler } from "../../../src/storage/storage.reconciler";

describe("StorageReconciler", () => {
  it("repairs a promotion before removing quarantine", async () => {
    const update = vi.fn();
    const prisma = { archivo: { findMany: vi.fn().mockResolvedValue([{ id: "f", objectKey: "k", quarantineKey: "k", status: "DISPONIBLE", updatedAt: new Date() }]), update } } as never;
    const storage: any = { head: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), copy: vi.fn(), delete: vi.fn(), list: vi.fn().mockResolvedValue({ objects: [] }) };
    await new StorageReconciler(prisma, storage, { get: () => 3600000 } as never).run();
    expect(storage.copy).toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalled();
  });
  it("removes only old unreferenced objects", async () => {
    const old = new Date(Date.now() - 10000);
    const prisma = { archivo: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() } } as never;
    const storage: any = { head: vi.fn(), delete: vi.fn(), list: vi.fn().mockResolvedValue({ objects: [{ key: "orphan", lastModified: old }] }) };
    await new StorageReconciler(prisma, storage, { get: () => 1000 } as never).run();
    expect(storage.delete).toHaveBeenCalledTimes(2);
  });
});
