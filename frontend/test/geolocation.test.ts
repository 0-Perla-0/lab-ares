import { afterEach, describe, expect, it, vi } from "vitest";
import { advisoryCoordinates } from "../lib/geolocation";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("advisory geolocation", () => {
  it("denial resolves without blocking", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_ok: unknown, reject: () => void) => reject(),
      },
    });
    expect(await advisoryCoordinates()).toBeUndefined();
  });
  it("missing API resolves without blocking", async () => {
    vi.stubGlobal("navigator", {});
    expect(await advisoryCoordinates()).toBeUndefined();
  });
  it("hard timeout resolves even when browser never invokes callback", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {
      geolocation: { getCurrentPosition: vi.fn() },
    });
    const promise = advisoryCoordinates();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await promise).toBeUndefined();
  });
  it("returns only needed coordinates, not the browser object", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: (p: object) => void) =>
          ok({
            coords: { latitude: 19, longitude: -99, accuracy: 5, altitude: 40 },
            timestamp: 123,
          }),
      },
    });
    expect(await advisoryCoordinates()).toEqual({
      latitude: 19,
      longitude: -99,
      accuracy: 5,
    });
  });
});
