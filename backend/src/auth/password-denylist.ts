import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

const MAX_CORPUS_BYTES = 32 * 1024 * 1024;
let cachedKey: string | undefined;
let cached = new Set<string>();

export function parsePasswordCorpus(text: string): Set<string> {
  const hashes = text.split(/\r?\n/).filter(Boolean);
  if (!hashes.length || hashes.some((hash) => !/^[a-fA-F0-9]{64}$/.test(hash)))
    throw new Error(
      "Invalid offline password corpus; expected SHA-256 UTF-8 hashes only",
    );
  return new Set(hashes.map((hash) => hash.toLowerCase()));
}

/** Immutable, checksummed corpus; never sends a password to another service. */
export function passwordDenyHashes(): ReadonlySet<string> {
  const inline = process.env.PASSWORD_DENY_SHA256 ?? "";
  const file = process.env.PASSWORD_DENY_FILE ?? "";
  const checksum = (process.env.PASSWORD_DENY_FILE_SHA256 ?? "").toLowerCase();
  const key = `${inline}\0${file}\0${checksum}`;
  if (key === cachedKey) return cached;
  const next = new Set<string>();
  if (inline)
    for (const hash of parsePasswordCorpus(inline.replaceAll(",", "\n")))
      next.add(hash);
  if (file || checksum) {
    if (!isAbsolute(file) || !/^[a-f0-9]{64}$/.test(checksum))
      throw new Error(
        "Offline password corpus requires an absolute path and approved checksum",
      );
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > MAX_CORPUS_BYTES)
      throw new Error(
        "Offline password corpus exceeds the 32 MiB resource limit",
      );
    const bytes = readFileSync(file);
    if (
      bytes.length > MAX_CORPUS_BYTES ||
      createHash("sha256").update(bytes).digest("hex") !== checksum
    )
      throw new Error("Offline password corpus checksum mismatch");
    for (const hash of parsePasswordCorpus(bytes.toString("utf8")))
      next.add(hash);
  }
  cached = next;
  cachedKey = key;
  return cached;
}
