import { afterEach, describe, expect, it, vi } from "vitest";
import {
  effectiveCalendarEvent,
  monthDays,
} from "@/components/portal/calendar-page";
import { socialError, socialMutation } from "@/lib/service-social";
import { ApiError } from "@/lib/api";
const user = { id: 5, areaId: 2, sedeId: 1 };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("service social UI contracts", () => {
  it("includes leap days and complete months", () => {
    expect(monthDays("2028-02")).toHaveLength(29);
    expect(monthDays("2026-02")).toHaveLength(28);
    expect(monthDays("2026-10").at(-1)).toBe("2026-10-31");
  });
  it("uses the same personal precedence as the backend", () => {
    const events: any[] = ["GLOBAL", "SEDE", "AREA", "USUARIO"].map(
      (alcance) => ({
        id: alcance,
        alcance,
        usuarioId: 5,
        areaId: 2,
        sedeId: 1,
        fechaInicio: "2026-10-01",
        fechaFin: "2026-10-31",
        createdAt: "2026-10-01",
      }),
    );
    expect(effectiveCalendarEvent(events, "2026-10-10", user)?.alcance).toBe(
      "USUARIO",
    );
    events.at(-1)!.usuarioId = 99;
    expect(effectiveCalendarEvent(events, "2026-10-10", user)?.alcance).toBe(
      "AREA",
    );
  });
  it("resolves same-scope ties identically and ignores out-of-range events", () => {
    const events: any[] = [
      {
        id: "a",
        alcance: "GLOBAL",
        fechaInicio: "2026-10-01",
        fechaFin: "2026-10-31",
        createdAt: "2026-10-01",
      },
      {
        id: "b",
        alcance: "GLOBAL",
        fechaInicio: "2026-10-01",
        fechaFin: "2026-10-31",
        createdAt: "2026-10-02",
      },
    ];
    expect(effectiveCalendarEvent(events, "2026-10-10", user)?.id).toBe("b");
    expect(effectiveCalendarEvent(events, "2026-11-01", user)).toBeUndefined();
  });
  it("keeps retry identity after lost connection without persisting private narrative", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key),
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const fetch = vi.fn().mockRejectedValue(new TypeError("network lost"));
    vi.stubGlobal("fetch", fetch);
    const body = { version: 1, motivo: "Contenido médico privado" };
    await expect(
      socialMutation(5, "/api/absences/test/justify", body),
    ).rejects.toThrow();
    await expect(
      socialMutation(5, "/api/absences/test/justify", body),
    ).rejects.toThrow();
    expect(
      new Headers(fetch.mock.calls[0][1].headers).get("Idempotency-Key"),
    ).toBe(new Headers(fetch.mock.calls[1][1].headers).get("Idempotency-Key"));
    expect([...values.values()].join()).not.toContain(body.motivo);
  });
  it("does not invent success when a successful status has no valid envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 200 })),
    );
    await expect(
      socialMutation(6, "/api/absences/test/justify", {
        version: 1,
        motivo: "Válido",
      }),
    ).rejects.toThrow("RESULTADO_DESCONOCIDO");
  });
  it("announces unknown outcome rather than success and explains independent review", () => {
    expect(socialError(new TypeError("offline"))).toContain(
      "RESULTADO_DESCONOCIDO",
    );
    expect(
      socialError(new ApiError(403, "ABSENCE_INDEPENDENT_REVIEW_REQUIRED")),
    ).toContain("distinta");
  });
});
