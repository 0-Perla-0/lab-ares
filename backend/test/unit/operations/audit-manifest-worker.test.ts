import { describe, expect, it, vi } from "vitest";
import { AuditManifestWorker } from "../../../src/operations/audit-manifest.worker";

function deps(barrier: Array<{ active: boolean; version: number }>) {
  const findUnique = vi.fn();
  for (const row of barrier) findUnique.mockResolvedValueOnce(row);
  findUnique.mockResolvedValue(barrier.at(-1));
  const prisma: any = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    recoveryWriteBarrier: { findUnique },
  };
  prisma.$transaction = vi.fn((fn: any) => fn(prisma));
  const operations: any = {
    createJob: vi.fn().mockResolvedValue({ id: "job-1", state: "PENDING" }),
    claimJob: vi.fn().mockResolvedValue({}),
    completeJob: vi.fn().mockResolvedValue({}),
    failJob: vi.fn().mockResolvedValue({}),
  };
  const audit: any = { createSystemManifest: vi.fn().mockResolvedValue({}) };
  const logger: any = { write: vi.fn() };
  const config: any = { get: vi.fn().mockReturnValue(3) };
  return {
    operations,
    audit,
    worker: new AuditManifestWorker(config, audit, operations, logger, prisma),
  };
}

describe("audit manifest worker epoch", () => {
  it("threads the claimed epoch through job, manifest and completion", async () => {
    const d = deps([{ active: false, version: 11 }]);
    await d.worker.tick(new Date("2026-10-27T12:00:00Z"));
    expect(d.operations.createJob).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      11,
    );
    expect(d.operations.claimJob).toHaveBeenCalledWith(
      "job-1",
      expect.anything(),
      undefined,
      11,
    );
    expect(d.audit.createSystemManifest).toHaveBeenCalledWith("2026-10-26", 11);
    expect(d.operations.completeJob).toHaveBeenCalledWith(
      "job-1",
      expect.anything(),
      undefined,
      11,
    );
  });

  it("does nothing while the write barrier is active", async () => {
    const d = deps([{ active: true, version: 12 }]);
    await d.worker.tick(new Date("2026-10-27T12:00:00Z"));
    expect(d.operations.createJob).not.toHaveBeenCalled();
    expect(d.audit.createSystemManifest).not.toHaveBeenCalled();
  });
});
