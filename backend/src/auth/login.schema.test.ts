import { describe, expect, it } from "vitest";

import { loginSchema } from "./login.schema";

describe("loginSchema", () => {
  it("trims and normalizes a valid email", () => {
    const result = loginSchema.parse({
      email: "  ADMIN@ARES.LOCAL  ",
      password: "Admin123!",
    });

    expect(result).toEqual({
      email: "admin@ares.local",
      password: "Admin123!",
    });
  });

  it.each([
    {},
    { email: "not-an-email", password: "Admin123!" },
    { email: "admin@ares.local", password: "" },
    { email: "admin@ares.local", password: "a".repeat(129) },
  ])("rejects invalid login input", (input) => {
    expect(loginSchema.safeParse(input).success).toBe(false);
  });
});
