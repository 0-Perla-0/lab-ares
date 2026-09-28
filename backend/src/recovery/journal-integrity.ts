import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (typeof value === "number" && !Number.isFinite(value))
    throw new TypeError("Journal values must be finite JSON numbers");
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

export function journalHash(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export interface JournalEnvelope {
  entryId: string;
  sequence: number;
  previousHash: string | null;
  payloadHash: string;
  entryHash: string;
  occurredAt: string;
  keyVersion: string;
  payload: Record<string, unknown>;
}

export function signJournalEnvelope(envelope: JournalEnvelope, secret: string) {
  return createHmac("sha256", secret).update(canonical(envelope)).digest("hex");
}

export function verifyJournalEnvelope(
  envelope: JournalEnvelope,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = Buffer.from(signJournalEnvelope(envelope, secret), "hex");
  const received = Buffer.from(signature, "hex");
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
