import { z } from "zod";
export function parseDeletionKeyring(
  value: string | undefined,
): Record<string, string> {
  return z
    .record(z.string().regex(/^[A-Za-z0-9._-]{1,50}$/), z.string().min(32))
    .parse(JSON.parse(value || "{}"));
}
