import { afterEach, describe, expect, it, vi } from "vitest";
import { criticalMutation } from "@/lib/service-social";
import { ApiError } from "@/lib/api";
import {
  DOCUMENT_MAX_BYTES,
  formalizeExpedient,
} from "@/lib/backend2/documents";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
describe("completion mutation contracts", () => {
  it("coalesces concurrent identical submissions without clearing a newer intent", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(response({ data: { id: "one" } })),
      );
    vi.stubGlobal("fetch", fetch);
    const one = criticalMutation("/api/documents/versions/concurrent-unit", {
      file: "same",
    });
    const two = criticalMutation("/api/documents/versions/concurrent-unit", {
      file: "same",
    });
    await expect(
      criticalMutation("/api/documents/versions/concurrent-unit", {
        file: "different",
      }),
    ).rejects.toThrow("RESULTADO_DESCONOCIDO");
    expect(await Promise.all([one, two])).toEqual([
      { id: "one" },
      { id: "one" },
    ]);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("keeps the same key after an uncertain response and refuses an altered intent", async () => {
    const path = "/api/documents/versions/retry-unit";
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("lost response"))
      .mockImplementation(() =>
        Promise.resolve(response({ data: { id: "committed" } })),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      criticalMutation(path, { sensitive: "private text" }),
    ).rejects.toThrow("lost response");
    await expect(
      criticalMutation(path, { sensitive: "changed text" }),
    ).rejects.toThrow("RESULTADO_DESCONOCIDO");
    expect(fetch).toHaveBeenCalledOnce();
    expect(await criticalMutation(path, { sensitive: "private text" })).toEqual(
      { id: "committed" },
    );
    expect(
      new Headers(fetch.mock.calls[0][1].headers).get("Idempotency-Key"),
    ).toBe(new Headers(fetch.mock.calls[1][1].headers).get("Idempotency-Key"));
    await criticalMutation(path, { sensitive: "changed text" });
    expect(
      new Headers(fetch.mock.calls[2][1].headers).get("Idempotency-Key"),
    ).not.toBe(
      new Headers(fetch.mock.calls[0][1].headers).get("Idempotency-Key"),
    );
  });
  it("does not interpret a malformed successful response as business confirmation", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ wrong: true }))
      .mockResolvedValue(response({ data: { id: "ok" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      criticalMutation("/api/documents/versions/unknown-unit", {}),
    ).rejects.toThrow("RESULTADO_DESCONOCIDO");
    await criticalMutation("/api/documents/versions/unknown-unit", {});
    expect(
      new Headers(fetch.mock.calls[0][1].headers).get("Idempotency-Key"),
    ).toBe(new Headers(fetch.mock.calls[1][1].headers).get("Idempotency-Key"));
  });
  it("starts a new intent after a definitive business rejection", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ error: "DOCUMENT_NOT_FOUND" }, 404))
      .mockResolvedValue(response({ data: {} }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      criticalMutation("/api/documents/versions/rejected-unit", {}),
    ).rejects.toBeInstanceOf(ApiError);
    await criticalMutation("/api/documents/versions/rejected-unit", {});
    expect(
      new Headers(fetch.mock.calls[0][1].headers).get("Idempotency-Key"),
    ).not.toBe(
      new Headers(fetch.mock.calls[1][1].headers).get("Idempotency-Key"),
    );
  });
  it("keeps the approved module limit and an explicit idempotent formalization request", async () => {
    expect(DOCUMENT_MAX_BYTES).toBe(10 * 1024 * 1024);
    const fetch = vi
      .fn()
      .mockResolvedValue(response({ data: { id: "formalized" } }));
    vi.stubGlobal("fetch", fetch);
    await formalizeExpedient(2, "2026-10-12");
    expect(fetch.mock.calls[0][0]).toBe("/api/documents/formalizations");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      usuarioId: 2,
      inicio: "2026-10-12",
    });
    expect(
      new Headers(fetch.mock.calls[0][1].headers).get("Idempotency-Key"),
    ).toMatch(/^[A-Za-z0-9_-]{16,100}$/);
  });
});
