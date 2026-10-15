import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiException } from "../common/errors/api.exception";

export const visitKeyringSchema = z
  .record(z.string().regex(/^[A-Za-z0-9_-]{1,32}$/), z.string().min(32))
  .refine((keys) => Object.keys(keys).length <= 8, "At most eight visit keys");
export function parseVisitKeyring(value: string) {
  return visitKeyringSchema.parse(JSON.parse(value));
}
export function visitCode(
  id: string,
  version: string,
  legacy: string,
  keyring: string = "",
) {
  const keys = keyring ? parseVisitKeyring(keyring) : undefined;
  const key = keys
    ? Object.hasOwn(keys, version)
      ? keys[version]
      : undefined
    : version === "legacy"
      ? legacy
      : undefined;
  if (!key) throw new ApiException("VISIT_KEY_RETIRED", 409);
  return createHmac("sha256", key)
    .update(
      version === "legacy"
        ? `ares:visit:v1:${id}`
        : `ares:visit:${version}:${id}`,
    )
    .digest("hex");
}
export function sameVisitCode(a: string, b: string) {
  return (
    /^[a-f0-9]{64}$/.test(a) &&
    a.length === b.length &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
