import { describe, expect, it } from "vitest";

import {
  DEVELOPMENT_SESSION_SECRET,
  validateEnvironment,
} from "../../../src/config/environment";

const base = {
  DATABASE_URL: "mysql://ares:secret@localhost:3306/ares_test",
};

describe("validateEnvironment", () => {
  it("provides safe development defaults", () => {
    expect(validateEnvironment(base)).toMatchObject({
      NODE_ENV: "development",
      BACKEND_PORT: 3000,
      APP_TIME_ZONE: "America/Mexico_City",
      SESSION_SECRET: DEVELOPMENT_SESSION_SECRET,
      GAMIFICATION_ENABLED: false,
      PRINTING_3D_ENABLED: false,
    });
  });

  it("parses the gamification feature flag without treating the string false as true", () => {
    expect(
      validateEnvironment({ ...base, GAMIFICATION_ENABLED: "false" })
        .GAMIFICATION_ENABLED,
    ).toBe(false);
    expect(
      validateEnvironment({ ...base, GAMIFICATION_ENABLED: "true" })
        .GAMIFICATION_ENABLED,
    ).toBe(true);
  });

  it("parses the printing feature flag without treating the string false as true", () => {
    expect(
      validateEnvironment({ ...base, PRINTING_3D_ENABLED: "false" })
        .PRINTING_3D_ENABLED,
    ).toBe(false);
    expect(
      validateEnvironment({ ...base, PRINTING_3D_ENABLED: "true" })
        .PRINTING_3D_ENABLED,
    ).toBe(true);
  });

  it("rejects an invalid application time zone", () => {
    expect(() =>
      validateEnvironment({ ...base, APP_TIME_ZONE: "Mars/Olympus" }),
    ).toThrow();
  });

  it.each([
    DEVELOPMENT_SESSION_SECRET,
    "replace-this-with-at-least-32-random-characters",
  ])("rejects the known production placeholder", (SESSION_SECRET) => {
    expect(() =>
      validateEnvironment({ ...base, NODE_ENV: "production", SESSION_SECRET }),
    ).toThrow();
  });

  it("accepts an explicit production secret", () => {
    expect(
      validateEnvironment({
        ...base,
        NODE_ENV: "production",
        SESSION_SECRET: "a-unique-production-secret-with-32-characters",
        OUTBOX_ENCRYPTION_KEY: "a-unique-production-outbox-key-32chars",
        MFA_ENCRYPTION_KEY: "a-unique-production-mfa-key-32chars",
      }),
    ).toMatchObject({ NODE_ENV: "production" });
  });

  it("rejects a short production outbox key", () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: "production",
        SESSION_SECRET: "a-unique-production-secret-with-32-characters",
        OUTBOX_ENCRYPTION_KEY: "short",
      }),
    ).toThrow();
  });

  it("rejects the development outbox placeholder in production", () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: "production",
        SESSION_SECRET: "a-unique-production-secret-with-32-characters",
        OUTBOX_ENCRYPTION_KEY: "development-only-outbox-key-change-me-32chars",
      }),
    ).toThrow();
  });
});
