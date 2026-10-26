import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiRequest: vi.fn() };
});

import { ApiError, apiRequest } from "@/lib/api";
import { durableRequest } from "@/lib/backend2/durable-request";

const requestMock = vi.mocked(apiRequest);
const keyOf = (call: number) =>
  new Headers((requestMock.mock.calls[call][1] as RequestInit).headers).get(
    "Idempotency-Key",
  );

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("durable mutations from the portal", () => {
  it("reuses one key across a retry of the same intent and renews it after success", async () => {
    vi.stubGlobal("window", {});
    requestMock
      .mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce({ data: { id: 1 } })
      .mockResolvedValueOnce({ data: { id: 2 } });
    const send = () =>
      durableRequest(
        7,
        "org-sede-create",
        "Centro",
        "/api/organization/sedes",
        "POST",
        {
          nombre: "Centro",
        },
      );
    await expect(send()).rejects.toThrow("network lost");
    await send();
    await send();
    expect(keyOf(0)).toBeTruthy();
    expect(keyOf(1)).toBe(keyOf(0));
    expect(keyOf(2)).not.toBe(keyOf(0));
  });

  it("starts a new intent when the payload changes", async () => {
    vi.stubGlobal("window", {});
    requestMock
      .mockRejectedValueOnce(new ApiError(503, "UPLOAD_CAPACITY_EXCEEDED"))
      .mockResolvedValueOnce({ data: {} });
    await expect(
      durableRequest(7, "user-update", "9", "/api/users/9", "PUT", {
        rol: "A",
      }),
    ).rejects.toBeInstanceOf(ApiError);
    await durableRequest(7, "user-update", "9", "/api/users/9", "PUT", {
      rol: "B",
    });
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it("sends the body as JSON only when there is one", async () => {
    requestMock.mockResolvedValue({ data: {} });
    await durableRequest(
      7,
      "org-sede-deactivate",
      "3",
      "/api/organization/sedes/3",
      "DELETE",
    );
    const options = requestMock.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe("DELETE");
    expect(options.body).toBeUndefined();
  });
});
