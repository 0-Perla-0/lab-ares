import { describe, expect, it, vi } from "vitest";

import { WriteBarrierGuard } from "../../../src/recovery/write-barrier.guard";

function context(method: string, originalUrl: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, originalUrl, url: originalUrl }),
    }),
  } as any;
}

function guard(active = true) {
  return new WriteBarrierGuard({
    recoveryWriteBarrier: {
      findUnique: vi.fn(async () => ({
        active,
        runId: active ? "run-1" : null,
        version: 4,
        frozenAt: new Date("2026-09-27T00:00:00Z"),
        snapshotAt: new Date("2026-09-27T00:00:00Z"),
      })),
    },
  } as any);
}

describe("global recovery write barrier", () => {
  it("blocks ordinary mutations with a stable 503 snapshot", async () => {
    await expect(
      guard().canActivate(context("POST", "/api/users")),
    ).rejects.toMatchObject({
      code: "RECOVERY_WRITE_BARRIER_ACTIVE",
      status: 503,
      details: { barrier: { runId: "run-1", version: 4 } },
    });
  });

  it.each([
    ["GET", "/api/users"],
    ["POST", "/api/recovery/run-1/reconciliation/execute"],
    ["POST", "/api/auth/login"],
    ["POST", "/api/audit/manifests/2026-09-27"],
  ])("allows control-plane request %s %s", async (method, url) => {
    await expect(guard().canActivate(context(method, url))).resolves.toBe(true);
  });

  it("does not allow auth prefix collisions", async () => {
    await expect(
      guard().canActivate(context("POST", "/api/auth/login-anything")),
    ).rejects.toMatchObject({ code: "RECOVERY_WRITE_BARRIER_ACTIVE" });
  });
});
