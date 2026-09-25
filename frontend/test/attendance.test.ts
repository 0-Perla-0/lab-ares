import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearIdempotencyKey,
  formatDate,
  formatDuration,
  idempotencyKey,
  reconcileCheckIn,
} from "@/lib/attendance";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("attendance helpers", () => {
  it("reuses a key for the same operation and payload, but separates payloads", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", storage());
    const first = idempotencyKey(7, "close", "22", "motivo a");
    expect(idempotencyKey(7, "close", "22", "motivo a")).toBe(first);
    expect(idempotencyKey(7, "close", "22", "motivo b")).not.toBe(first);
    clearIdempotencyKey(7, "close", "22");
  });

  it("keeps a stable in-memory key when sessionStorage throws", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    const first = idempotencyKey(7, "check-in", "", "{}");
    expect(idempotencyKey(7, "check-in", "", "{}")).toBe(first);
  });

  it("reconciles a pending check-in only when the server reports an open session", () => {
    vi.stubGlobal("window", {});
    const store = storage();
    vi.stubGlobal("sessionStorage", store);
    const key = idempotencyKey(7, "check-in", "", "{}");
    reconcileCheckIn(7, false);
    expect(idempotencyKey(7, "check-in", "", "{}")).toBe(key);
    reconcileCheckIn(7, true);
    expect(idempotencyKey(7, "check-in", "", "{}")).not.toBe(key);
  });

  it("formats durations without rounding and dates across midnight", () => {
    expect(formatDuration(3661)).toBe("1 h 01 min");
    expect(formatDuration(-1)).toBe("0 h 00 min");
    const formatted = formatDate("2026-09-23T00:30:00.000Z", "UTC");
    expect(formatted).toContain("23");
  });
});
