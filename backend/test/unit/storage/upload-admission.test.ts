import { describe, expect, it, vi } from "vitest";
import { UploadAdmissionService } from "../../../src/storage/upload-admission.service";
import {
  registerUploadAdmission,
  uploadAdmission,
} from "../../../src/storage/upload-admission";

function make(
  settings: Record<string, number> = {},
  counts: { global?: number; mine?: number } = {},
) {
  const tx: any = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    uploadAdmission: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn(({ where }: any) =>
        Promise.resolve(
          where.actorId ? (counts.mine ?? 0) : (counts.global ?? 0),
        ),
      ),
      create: vi.fn().mockResolvedValue({ id: "slot-1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const db: any = { ...tx, $transaction: vi.fn((fn: any) => fn(tx)) };
  const config: any = {
    get: (key: string) =>
      ({
        STORAGE_GLOBAL_UPLOAD_CEILING: 4,
        STORAGE_USER_UPLOAD_CEILING: 2,
        STORAGE_UPLOAD_LEASE_MS: 60000,
        ...settings,
      })[key],
  };
  return { service: new UploadAdmissionService(db, config), tx, db };
}

describe("cross-replica upload admission", () => {
  it("serializes the decision under the gate lock and leases the slot", async () => {
    const { service, tx } = make();
    await expect(service.reserve(7)).resolves.toBe("slot-1");
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.uploadAdmission.deleteMany).toHaveBeenCalledWith({
      where: { leaseUntil: { lt: expect.any(Date) } },
    });
    expect(tx.uploadAdmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 7,
        leaseUntil: expect.any(Date),
      }),
    });
  });

  it("rejects when the global ceiling is reached, whichever replica holds the slots", async () => {
    const { service, tx } = make({}, { global: 4 });
    await expect(service.reserve(7)).rejects.toMatchObject({
      code: "UPLOAD_CAPACITY_EXCEEDED",
    });
    expect(tx.uploadAdmission.create).not.toHaveBeenCalled();
  });

  it("limits one person without starving the others", async () => {
    const { service, tx } = make({}, { global: 1, mine: 2 });
    await expect(service.reserve(7)).rejects.toMatchObject({
      code: "UPLOAD_USER_CAPACITY_EXCEEDED",
    });
    expect(tx.uploadAdmission.create).not.toHaveBeenCalled();
  });

  it("does nothing when both ceilings are disabled", async () => {
    const { service, db } = make({
      STORAGE_GLOBAL_UPLOAD_CEILING: 0,
      STORAGE_USER_UPLOAD_CEILING: 0,
    });
    await expect(service.reserve(7)).resolves.toBeUndefined();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("renews only its own slot and tolerates a failing release", async () => {
    const { service, tx } = make();
    await service.renew("slot-1");
    expect(tx.uploadAdmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "slot-1" }),
      }),
    );
    tx.uploadAdmission.deleteMany.mockRejectedValue(new Error("db down"));
    await expect(service.release("slot-1")).resolves.toBeUndefined();
    await expect(service.release(undefined)).resolves.toBeUndefined();
  });

  it("registers itself for the static multer storage engine", () => {
    const { service } = make();
    service.onModuleInit();
    expect(uploadAdmission()).toBe(service);
    registerUploadAdmission(undefined as never);
  });
});
