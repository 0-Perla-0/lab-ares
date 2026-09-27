import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import {
  gamificationApi,
  isGamificationDisabled,
} from "@/lib/backend2/gamification";
import {
  activityStateLabel,
  kairosApi,
  projectCanManage,
} from "@/lib/backend2/kairos";

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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

describe("Kairos frontend adapter", () => {
  it("encodes project filters without inventing public scope", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response({ data: { items: [], page: 2, pageSize: 12, total: 0 } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await kairosApi.listProjects({
      page: 2,
      pageSize: 12,
      search: "equipo azul",
      favorite: true,
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/kairos/projects?page=2&pageSize=12&search=equipo+azul&favorite=true",
    );
    expect(options).toMatchObject({
      credentials: "include",
      cache: "no-store",
    });
  });

  it("uses the activity transition endpoint with an allowed state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ data: { id: "a1" } }));
    vi.stubGlobal("fetch", fetchMock);
    await kairosApi.transition(
      "project/id",
      "activity/id",
      "BLOQUEADA",
      "Dependencia externa",
    );
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "/api/kairos/projects/project%2Fid/activities/activity%2Fid/transition",
    );
    expect(options.method).toBe("POST");
    expect(JSON.parse(String(options.body))).toEqual({
      state: "BLOQUEADA",
      comment: "Dependencia externa",
    });
  });

  it("submits only an already available file id to the evidence contract", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ data: { id: "a1" } }));
    vi.stubGlobal("fetch", fetchMock);
    await kairosApi.submit(
      "p1",
      "a1",
      "abcdef0123456789abcdef01234567",
      "Entrega inicial",
    );
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/kairos/projects/p1/activities/a1/submit");
    expect(JSON.parse(String(options.body))).toEqual({
      archivoId: "abcdef0123456789abcdef01234567",
      comment: "Entrega inicial",
    });
  });

  it("keeps management decisions and state labels explicit", () => {
    expect(projectCanManage("PROPIETARIO")).toBe(true);
    expect(projectCanManage("SUBLIDER")).toBe(true);
    expect(projectCanManage("COLABORADOR")).toBe(false);
    expect(activityStateLabel.EN_REVISION).toBe("En revisión");
  });
});

describe("private gamification adapter", () => {
  it("recognizes the feature-disabled response", () => {
    expect(
      isGamificationDisabled(new ApiError(503, "GAMIFICATION_DISABLED")),
    ).toBe(true);
    expect(isGamificationDisabled(new ApiError(403, "FORBIDDEN"))).toBe(false);
  });

  it("uses a stable idempotency key while a recognition retry is unresolved", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", storage());
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ error: "RETRY_REQUIRED" }, 503));
    vi.stubGlobal("fetch", fetchMock);
    const body = { usuarioId: 22, puntos: 10, motivo: "Apoyo extraordinario" };
    await expect(gamificationApi.recognize(1, body)).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(gamificationApi.recognize(1, body)).rejects.toBeInstanceOf(
      ApiError,
    );
    const firstKey = (fetchMock.mock.calls[0][1].headers as Headers).get(
      "Idempotency-Key",
    );
    const secondKey = (fetchMock.mock.calls[1][1].headers as Headers).get(
      "Idempotency-Key",
    );
    expect(firstKey).toBe(secondKey);
    expect(firstKey?.length).toBeGreaterThanOrEqual(8);
  });

  it("uses a new idempotency key after a successful recognition", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", storage());
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(response({ data: { id: "event-1" } })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const body = { usuarioId: 22, puntos: 10, motivo: "Apoyo extraordinario" };
    await gamificationApi.recognize(1, body);
    await gamificationApi.recognize(1, body);
    const first = (fetchMock.mock.calls[0][1].headers as Headers).get(
      "Idempotency-Key",
    );
    const second = (fetchMock.mock.calls[1][1].headers as Headers).get(
      "Idempotency-Key",
    );
    expect(second).not.toBe(first);
  });

  it("reverses events through a private admin endpoint with a reason", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", storage());
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ data: { id: "reverse-1" } }));
    vi.stubGlobal("fetch", fetchMock);
    await gamificationApi.reverse(1, "event/id", "Captura duplicada");
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/gamification/admin/events/event%2Fid/reverse");
    expect(JSON.parse(String(options.body))).toEqual({
      motivo: "Captura duplicada",
    });
    expect((options.headers as Headers).get("Idempotency-Key")).toBeTruthy();
  });
});
