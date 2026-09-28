import { describe, expect, it } from "vitest";

import {
  journalHash,
  type JournalEnvelope,
  signJournalEnvelope,
  verifyJournalEnvelope,
} from "../../../src/recovery/journal-integrity";

const secret = "test-only-journal-secret-with-32-characters";
const envelope: JournalEnvelope = {
  entryId: "entry-1",
  sequence: 1,
  previousHash: null,
  payloadHash: journalHash({ value: 1 }),
  entryHash: journalHash({ entry: 1 }),
  occurredAt: "2026-09-27T00:00:00.000Z",
  keyVersion: "v1",
  payload: { value: 1 },
};

describe("suppression journal integrity", () => {
  it("signs canonical payloads and verifies the matching envelope", () => {
    const signature = signJournalEnvelope(envelope, secret);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyJournalEnvelope(envelope, signature, secret)).toBe(true);
  });

  it("rejects tampering, a wrong key, and malformed signatures", () => {
    const signature = signJournalEnvelope(envelope, secret);
    expect(
      verifyJournalEnvelope({ ...envelope, sequence: 2 }, signature, secret),
    ).toBe(false);
    expect(verifyJournalEnvelope(envelope, signature, `${secret}-wrong`)).toBe(
      false,
    );
    expect(verifyJournalEnvelope(envelope, "missing", secret)).toBe(false);
  });
});
