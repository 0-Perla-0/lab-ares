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
    });
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
      }),
    ).toMatchObject({ NODE_ENV: "production" });
  });
});
