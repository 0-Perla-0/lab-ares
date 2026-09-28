import { describe, expect, it, vi } from "vitest";

import { RetentionService } from "../../../src/retention/retention.service";

describe("suppression journal transactional outbox", () => {
  it("advances the locked chain with a fingerprint-only payload", async () => {
    const create = vi.fn(async ({ data }: any) => ({
      id: "journal-2",
      ...data,
    }));
    const update = vi.fn(async ({ data }: any) => ({
      id: "journal-2",
      ...data,
    }));
    const headUpdate = vi.fn(async () => ({}));
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      suppressionJournalEntry: {
        findUnique: vi.fn(async () => null),
        create,
        update,
      },
      suppressionJournalHead: {
        findUnique: vi.fn(async () => ({
          id: "global",
          lastSequence: 1,
          lastHash: "a".repeat(64),
        })),
        update: headUpdate,
      },
    };
    const service = new RetentionService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await (service as any).enqueueSuppressionJournal(tx, {
      id: "registry-private-id",
      categoria: "EXPORTACIONES",
      resourceType: "ReporteExportacion",
      resourceFingerprint: "b".repeat(64),
      accion: "ELIMINAR",
      policyVersion: 3,
      occurredAt: new Date("2026-09-27T01:00:00.000Z"),
    });
    const data = create.mock.calls[0][0].data;
    expect(data.sequence).toBe(2);
    expect(data.previousHash).toBe("a".repeat(64));
    expect(data.payload).toEqual({
      category: "EXPORTACIONES",
      resourceType: "ReporteExportacion",
      resourceFingerprint: "b".repeat(64),
      action: "ELIMINAR",
      policyVersion: 3,
      occurredAt: "2026-09-27T01:00:00.000Z",
    });
    expect(JSON.stringify(data.payload)).not.toContain("registry-private-id");
    expect(update.mock.calls[0][0].data.entryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(headUpdate).toHaveBeenCalledWith({
      where: { id: "global" },
      data: {
        lastSequence: 2,
        lastHash: update.mock.calls[0][0].data.entryHash,
      },
    });
  });
});
