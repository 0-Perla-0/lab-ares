import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiError, getApiErrorMessage } from "../lib/api";

afterEach(() => vi.unstubAllGlobals());
describe("security API boundaries", () => {
  it("keeps the existing session UI when recent confirmation credentials are wrong", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "INVALID_CREDENTIALS" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(
      apiRequest("/api/auth/reauthenticate", { method: "POST", body: "{}" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
  it("prompts recent authentication without replaying the rejected business mutation", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal(
      "CustomEvent",
      class {
        readonly type: string;
        readonly options: object;
        constructor(type: string, options: object) {
          this.type = type;
          this.options = options;
        }
      },
    );
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "REAUTH_REQUIRED",
          details: { factor: "mfa" },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      apiRequest("/api/users/4/recovery", { method: "POST", body: "{}" }),
    ).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ares:reauthenticate",
        options: { detail: { factor: "mfa" } },
      }),
    );
  });
  it("explains recent authentication without claiming that the mutation succeeded", () => {
    expect(getApiErrorMessage(new ApiError(403, "REAUTH_REQUIRED"))).toContain(
      "No se aplicó ningún cambio",
    );
  });
  it("signals successful server activity, never activity from a rejected mutation", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await apiRequest("/api/auth/session-status");
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ares:session-activity" }),
    );
  });
  it("redirects expired identity without inventing a replacement session", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(apiRequest("/api/users")).rejects.toMatchObject({
      status: 401,
    });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ares:unauthorized" }),
    );
    expect(dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "ares:session-activity" }),
    );
  });
});
