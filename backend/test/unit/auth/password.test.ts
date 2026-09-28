import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../../../src/auth/password";

describe("password helpers", () => {
  it("hashes and verifies a password without returning plaintext", async () => {
    const password = "Admin123!secure";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toBe(password);
    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect", passwordHash)).resolves.toBe(
      false,
    );
  });

  it("accepts long Unicode passwords under the Argon2 policy", async () => {
    const longPassword = "a".repeat(73);

    const hash = await hashPassword(longPassword);
    await expect(verifyPassword(longPassword, hash)).resolves.toBe(true);
  });
});
