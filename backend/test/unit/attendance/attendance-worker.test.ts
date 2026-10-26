import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceWorker } from "../../../src/attendance/attendance.worker";

const closeOverdue = vi.hoisted(() => vi.fn());
vi.mock("../../../src/attendance/attendance-cutoff", () => ({ closeOverdue }));

const checkInAt = new Date("2026-10-01T15:00:00Z");
const now = new Date("2026-10-05T12:00:00Z");

function deps(barrier: Array<{ active: boolean; version: number }>) {
  const findUnique = vi.fn();
  for (const row of barrier) findUnique.mockResolvedValueOnce(row);
  findUnique.mockResolvedValue(barrier.at(-1));
  const tx: any = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    recoveryWriteBarrier: { findUnique },
    asistencia: {
      findMany: vi.fn().mockResolvedValue([
        { userId: 1, checkInAt },
        { userId: 2, checkInAt },
      ]),
    },
  };
  tx.$transaction = vi.fn((fn: any) => fn(tx));
  return {
    tx,
    worker: new AttendanceWorker(
      tx,
      { append: vi.fn() } as any,
      { get: vi.fn() } as any,
    ),
  };
}

describe("attendance cutoff worker epoch", () => {
  beforeEach(() => closeOverdue.mockReset().mockResolvedValue(true));

  it("closes every overdue row inside one epoch", async () => {
    const d = deps([{ active: false, version: 7 }]);
    expect(await d.worker.processDue(100, now)).toBe(2);
    expect(closeOverdue).toHaveBeenCalledTimes(2);
  });

  it("stops when the epoch moves between rows", async () => {
    // worker check, first row (epoch 7), then an unfreeze opened epoch 8
    const d = deps([
      { active: false, version: 7 },
      { active: false, version: 7 },
      { active: false, version: 8 },
    ]);
    expect(await d.worker.processDue(100, now)).toBe(0);
    expect(closeOverdue).toHaveBeenCalledTimes(1);
  });

  it("closes nothing while frozen", async () => {
    const d = deps([{ active: true, version: 9 }]);
    expect(await d.worker.processDue(100, now)).toBe(0);
    expect(closeOverdue).not.toHaveBeenCalled();
  });
});
