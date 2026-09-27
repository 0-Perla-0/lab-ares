import { describe, expect, it, vi } from "vitest";

import { HealthService } from "../../../src/health/health.service";

describe("health dependency attribution", () => {
  it("attributes storage failure without reporting the database as down", async () => {
    const service = new HealthService(
      { $queryRaw: vi.fn(async () => 1) } as any,
      { health: vi.fn(async () => false) } as any,
      { health: vi.fn(async () => true) } as any,
      { get: () => true } as any,
    );
    await expect(service.readiness()).rejects.toMatchObject({
      response: expect.objectContaining({
        database: "connected",
        storage: "disconnected",
        scanner: "connected",
      }),
    });
  });

  it("reports a disabled scanner separately", async () => {
    const scanner = { health: vi.fn(async () => true) };
    const service = new HealthService(
      { $queryRaw: vi.fn(async () => 1) } as any,
      { health: vi.fn(async () => true) } as any,
      scanner as any,
      { get: () => false } as any,
    );
    await expect(service.readiness()).resolves.toMatchObject({
      status: "ok",
      dependencies: { scanner: "disabled" },
    });
    expect(scanner.health).not.toHaveBeenCalled();
  });
});
