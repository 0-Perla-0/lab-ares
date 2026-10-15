import { createHash } from "node:crypto";
import { jsonSafe } from "../http/json-safe.interceptor";
export function canonicalOperation(value: unknown): string {
  function sort(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === "object")
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, val]) => [key, sort(val)]),
      );
    return input;
  }
  // JSON semantics are preserved: undefined object fields disappear, arrays keep
  // order, dates serialize in UTC, BigInt uses the API-safe decimal representation.
  return JSON.stringify(sort(JSON.parse(JSON.stringify(jsonSafe(value)))));
}
export const operationFingerprint = (value: unknown) =>
  createHash("sha256").update(canonicalOperation(value)).digest("hex");
