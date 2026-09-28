import { describe, expect, it, vi } from "vitest";
import { ReportsWorker } from "../src/reports/reports.worker";

describe("ReportsWorker", () => {
  it("runs processing and cleanup in the same tick", async () => {
    const reports = {
      processDue: vi.fn().mockResolvedValue(1),
      cleanup: vi.fn().mockResolvedValue(1),
    };
    const config = { get: vi.fn() };
    const worker = new ReportsWorker(reports as any, config as any);
    await (worker as any).tick();
    expect(reports.processDue).toHaveBeenCalledOnce();
    expect(reports.cleanup).toHaveBeenCalledOnce();
    expect(reports.cleanup.mock.invocationCallOrder[0]).toBeGreaterThan(
      reports.processDue.mock.invocationCallOrder[0],
    );
  });

  it("does not overlap ticks", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reports = {
      processDue: vi.fn().mockReturnValue(pending),
      cleanup: vi.fn().mockResolvedValue(0),
    };
    const worker = new ReportsWorker(reports as any, { get: vi.fn() } as any);
    const first = (worker as any).tick();
    await (worker as any).tick();
    expect(reports.processDue).toHaveBeenCalledOnce();
    release();
    await first;
  });

  it("does not start when the worker is disabled", () => {
    vi.useFakeTimers();
    const reports = { processDue: vi.fn(), cleanup: vi.fn() };
    const config = {
      get: vi.fn((key: string) =>
        key === "REPORTS_WORKER_ENABLED" ? false : 1000,
      ),
    };
    const worker = new ReportsWorker(reports as any, config as any);
    worker.onModuleInit();
    vi.runOnlyPendingTimers();
    expect(reports.processDue).not.toHaveBeenCalled();
    worker.onModuleDestroy();
    vi.useRealTimers();
  });
});
