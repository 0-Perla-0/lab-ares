import argon2 from "argon2";
import { compare as bcryptCompare, truncates } from "bcryptjs";
import { ApiException } from "../common/errors/api.exception";
import { createHash } from "node:crypto";
import { passwordDenyHashes } from "./password-denylist";

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;
const blocked = new Set([
  "passwordpassword",
  "password123456789",
  "123456789012345",
  "1234567890123456",
  "qwertyuiopasdfgh",
  "aresaresaresares",
  "contraseñacontraseña",
]);
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function validatePasswordPolicy(
  password: string,
  identity: { email?: string; codigo?: string } = {},
): void {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    throw new ApiException("PASSWORD_LENGTH_INVALID", 400);
  }
  const normalized = password.normalize("NFKC").toLowerCase();
  const compact = normalized.replace(/[\s\W_]/gu, "");
  const digest = createHash("sha256").update(password, "utf8").digest("hex");
  const denyHashes = passwordDenyHashes();
  const identityValues = [identity.email, identity.codigo]
    .filter((value): value is string => !!value)
    .map((value) => value.normalize("NFKC").toLowerCase());
  const sequences = [
    "0123456789",
    "1234567890",
    "abcdefghijklmnopqrstuvwxyz",
    "qwertyuiopasdfghjklzxcvbnm",
  ];
  const sequential = sequences.some(
    (sequence) =>
      (sequence.repeat(16).includes(compact) ||
        [...sequence].reverse().join("").repeat(16).includes(compact)) &&
      compact.length >= 15,
  );
  if (
    blocked.has(normalized) ||
    /^(.)\1+$/u.test(password) ||
    /^(password|contrase[nñ]a|qwerty|letmein|welcome|bienvenido|admin|ares)(?:\d|[!@#$%^&*._-])*$/u.test(
      normalized,
    ) ||
    /^(.{1,4})\1{3,}$/u.test(normalized) ||
    sequential ||
    identityValues.includes(normalized) ||
    denyHashes.has(digest)
  )
    throw new ApiException("PASSWORD_BLOCKED", 400);
}

export async function hashPassword(
  password: string,
  identity: { email?: string; codigo?: string } = {},
): Promise<string> {
  validatePasswordPolicy(password, identity);
  return argon2.hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (truncates(password) && passwordHash.startsWith("$2")) return false;
  try {
    return passwordHash.startsWith("$argon2")
      ? await argon2.verify(passwordHash, password)
      : await bcryptCompare(password, passwordHash);
  } catch {
    return false;
  }
}

export function needsArgon2Rehash(passwordHash: string): boolean {
  return !passwordHash.startsWith("$argon2id$");
}
