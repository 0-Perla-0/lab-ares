import { afterEach, describe, expect, it } from "vitest";

import { LoginRateLimiter } from "../../../src/auth/login-rate-limiter";

describe("LoginRateLimiter", () => {
  const limiter = new LoginRateLimiter();

  afterEach(() => {
    limiter.reset("client");
  });

  it("blocks an IP after five attempts in one minute", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(limiter.consume("client", 1_000)).toBeNull();
    }

    expect(limiter.consume("client", 1_000)).toEqual({
      retryAfterSeconds: 60,
    });
  });

  it("starts a fresh window after expiration", () => {
    expect(limiter.consume("client", 1_000)).toBeNull();
    expect(limiter.consume("client", 61_001)).toBeNull();
  });

  it("clears failed attempts after a successful login", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.consume("client", 1_000);
    }
    limiter.reset("client");

    expect(limiter.consume("client", 1_000)).toBeNull();
  });
});
