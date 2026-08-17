import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../../../src/auth/password";

describe("password helpers", () => {
  it("hashes and verifies a password without returning plaintext", async () => {
    const password = "Admin123!";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toBe(password);
    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect", passwordHash)).resolves.toBe(
      false,
    );
  });

  it("rejects passwords that bcrypt would truncate", async () => {
    const longPassword = "a".repeat(73);

    await expect(hashPassword(longPassword)).rejects.toThrow(RangeError);
    await expect(verifyPassword(longPassword, "unused")).resolves.toBe(false);
  });
});
