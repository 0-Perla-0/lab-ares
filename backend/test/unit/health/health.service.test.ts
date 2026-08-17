import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../../src/database/prisma.service";
import { HealthService } from "../../../src/health/health.service";

const prisma = { $queryRaw: vi.fn() };
const health = new HealthService(prisma as unknown as PrismaService);

describe("HealthService", () => {
  it("reports process liveness without querying the database", () => {
    expect(health.liveness()).toEqual({ status: "ok" });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("reports readiness when MariaDB responds", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "1": 1 }]);
    await expect(health.readiness()).resolves.toEqual({
      status: "ok",
      database: "connected",
    });
  });

  it("rejects readiness when MariaDB is unavailable", async () => {
    prisma.$queryRaw.mockRejectedValue(new Error("offline"));
    await expect(health.readiness()).rejects.toMatchObject({ status: 503 });
  });
});
