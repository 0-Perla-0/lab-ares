import { compare, hash, truncates } from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  if (truncates(password)) {
    throw new RangeError("Password exceeds bcrypt's 72-byte limit.");
  }

  return hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (truncates(password)) {
    return false;
  }

  return compare(password, passwordHash);
}
