import argon2 from "argon2";
import { compare as bcryptCompare, truncates } from "bcryptjs";

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function validatePasswordPolicy(password: string): void {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    throw new RangeError(`Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters.`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePasswordPolicy(password);
  return argon2.hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (truncates(password) && passwordHash.startsWith("$2")) return false;
  try { return passwordHash.startsWith("$argon2") ? await argon2.verify(passwordHash, password) : await bcryptCompare(password, passwordHash); }
  catch { return false; }
}

export function needsArgon2Rehash(passwordHash: string): boolean {
  return !passwordHash.startsWith("$argon2id$");
}
