import { of, lastValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { CorrelationContext } from "../../../src/common/http/correlation-context";
import {
  CorrelationInterceptor,
  normalizeCorrelationId,
} from "../../../src/common/http/correlation.interceptor";

describe("request correlation", () => {
  it("keeps a valid client id in AsyncLocalStorage and returns it", async () => {
    const context = new CorrelationContext();
    const interceptor = new CorrelationInterceptor(context);
    const setHeader = vi.fn();
    const execution: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { "x-correlation-id": "client-12345678" },
        }),
        getResponse: () => ({ setHeader }),
      }),
    };
    const seen: string[] = [];
    await lastValueFrom(
      interceptor.intercept(execution, {
        handle: () =>
          of(null).pipe((source) => {
            seen.push(context.getId() ?? "missing");
            return source;
          }),
      }),
    );
    expect(setHeader).toHaveBeenCalledWith(
      "X-Correlation-Id",
      "client-12345678",
    );
    expect(seen).toEqual(["client-12345678"]);
  });

  it("rejects unsafe or malformed incoming identifiers", () => {
    expect(normalizeCorrelationId("bad\nheader")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
  });
});
