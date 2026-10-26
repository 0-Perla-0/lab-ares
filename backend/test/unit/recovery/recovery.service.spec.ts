import { describe, expect, it, vi } from "vitest";

import { RecoveryService } from "../../../src/recovery/recovery.service";
import {
  journalHash,
  signJournalEnvelope,
} from "../../../src/recovery/journal-integrity";

const actor = {
  id: 41,
  codigo: "ADMIN41",
  email: "admin@example.com",
  rol: "ADMIN",
  estado: "ACTIVO",
  sedeId: null,
  areaId: null,
  turnoId: null,
} as any;

function serviceFixture(run?: Record<string, unknown>) {
  const createRun = vi.fn(async ({ data }: any) => ({ id: "run-1", ...data }));
  const tx = {
    recoveryOperation: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "operation-1" })),
      update: vi.fn(async () => ({})),
    },
    recoveryRun: {
      create: createRun,
      findUnique: vi.fn(async () => run ?? null),
      update: vi.fn(async ({ data }: any) => ({ id: "run-1", ...data })),
    },
    recoveryImportedSuppression: { upsert: vi.fn(async () => ({})) },
    recoveryCheck: { create: vi.fn(async () => ({})) },
    recoveryStep: { create: vi.fn(async () => ({})) },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: any) => callback(tx)),
    recoveryOperation: { findUnique: vi.fn(async () => null) },
    recoveryRun: { findUnique: vi.fn(async () => run ?? null) },
    outboxEvent: { count: vi.fn(async () => 0) },
    suppressionJournalEntry: { count: vi.fn(async () => 0) },
    recoveryWriteBarrier: {
      findUnique: vi.fn(async () => ({
        active: true,
        runId: String(run?.id ?? "run-1"),
        version: 1,
        frozenAt: new Date(),
        snapshotAt: new Date(),
      })),
    },
  };
  const audit = { append: vi.fn(async () => ({})) };
  const deletion = {
    recoveryReady: vi.fn(async () => true),
    recoveryAssessment: vi.fn(async () => ({
      ready: true,
      unfinishedJobs: 0,
      orphanIntents: [] as { ref: string; reason: string }[],
      truncated: false,
    })),
  };
  const service = new RecoveryService(
    prisma as any,
    audit as any,
    {} as any,
    {} as any,
    {} as any,
    {
      dependencies: vi.fn(async () => ({
        database: "connected",
        storage: "connected",
        scanner: "connected",
      })),
    } as any,
    {
      get: (key: string) => {
        if (key === "RECOVERY_RECONCILIATION_MAX_ATTEMPTS") return 3;
        if (key === "SUPPRESSION_JOURNAL_KEY_VERSION") return "v1";
        if (key === "SUPPRESSION_JOURNAL_HMAC_SECRET")
          return "test-only-journal-secret-with-32-characters";
        return 120_000;
      },
    } as any,
    deletion as any,
  );
  return { service, createRun, tx, deletion };
}

describe("RecoveryService state governance", () => {
  it("cannot approve recovery with unresolved external deletion intents", async () => {
    const h = serviceFixture({
      id: "run-1",
      state: "SUPPRESSIONS_REAPPLIED",
      frozenById: 99,
      responsibleId: 98,
    });
    h.deletion.recoveryAssessment.mockResolvedValue({
      ready: false,
      unfinishedJobs: 0,
      orphanIntents: [
        { ref: "deletion-intents/a.json", reason: "NOT_IN_SQL" },
        { ref: "deletion-intents/b.json", reason: "NOT_IN_SQL" },
        { ref: "deletion-intents/c.json", reason: "VERSIONS_REMAINING" },
      ],
      truncated: false,
    });
    const failure = await h.service
      .approve(actor, "run-1", "deletion-readiness-0001")
      .catch((error) => error);
    expect(failure).toMatchObject({ code: "RECOVERY_READINESS_FAILED" });
    // Operators get counts by reason, never the external object references.
    const body = JSON.stringify(failure.details ?? failure.response ?? failure);
    expect(body).toContain("NOT_IN_SQL");
    expect(body).not.toContain("deletion-intents/");
    expect(h.tx.recoveryRun.update).not.toHaveBeenCalled();
  });
  it.each([
    ["CRITICO", 15, 240],
    ["IMPORTANTE", 60, 480],
    ["SECUNDARIO", 1440, 480],
  ])(
    "records contractual RPO/RTO targets for %s",
    async (scope, rpoTargetMinutes, rtoTargetMinutes) => {
      const { service, createRun } = serviceFixture();
      await service.create(
        actor,
        {
          name: `Recovery ${scope}`,
          scope: scope as never,
          responsibleId: 55,
          isDrill: true,
        },
        `recovery-create-${scope.toLowerCase()}`,
      );
      expect(createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rpoTargetMinutes,
            rtoTargetMinutes,
            createdById: actor.id,
          }),
        }),
      );
    },
  );

  it("rejects a transition from an invalid state", async () => {
    const { service } = serviceFixture({ id: "run-1", state: "PLANNED" });
    await expect(
      service.preview(actor, "run-1", 100, "recovery-preview-key"),
    ).rejects.toMatchObject({ code: "RECOVERY_STATE_INVALID" });
  });

  it("requires a different readiness approver from the freezer and responsible", async () => {
    const { service } = serviceFixture({
      id: "run-1",
      state: "SUPPRESSIONS_REAPPLIED",
      frozenById: actor.id,
      responsibleId: 55,
    });
    await expect(
      service.approve(actor, "run-1", "recovery-approval-key"),
    ).rejects.toMatchObject({
      code: "RECOVERY_SEPARATION_OF_DUTIES_REQUIRED",
    });
  });

  it("requires verified journal import before any suppression reapplication", async () => {
    const { service } = serviceFixture({
      id: "run-1",
      state: "AUDIT_VERIFIED",
    });
    await expect(
      service.reapply(actor, "run-1", 100, "recovery-reapply-key"),
    ).rejects.toMatchObject({ code: "RECOVERY_STATE_INVALID" });
  });

  it("imports a valid post-restore HMAC envelope and rejects tampering", async () => {
    const restorePoint = new Date("2026-09-27T00:00:00.000Z");
    const { service, tx } = serviceFixture({
      id: "run-1",
      state: "AUDIT_VERIFIED",
      restorePoint,
    });
    const payload = {
      category: "EXPORTACIONES",
      resourceType: "ReporteExportacion",
      resourceFingerprint: "a".repeat(64),
      action: "ELIMINAR",
      policyVersion: 1,
      occurredAt: "2026-09-27T01:00:00.000Z",
    } as const;
    const payloadHash = journalHash(payload);
    const unsigned = {
      entryId: "entry-1",
      sequence: 1,
      previousHash: null,
      payloadHash,
      entryHash: journalHash({
        entryId: "entry-1",
        sequence: 1,
        previousHash: null,
        payloadHash,
        occurredAt: payload.occurredAt,
      }),
      occurredAt: payload.occurredAt,
      keyVersion: "v1",
      payload,
    };
    const signature = signJournalEnvelope(
      unsigned,
      "test-only-journal-secret-with-32-characters",
    );
    await expect(
      service.importJournal(
        actor,
        "run-1",
        [{ ...unsigned, signature }],
        "recovery-journal-valid-key",
      ),
    ).resolves.toEqual({ imported: 1, verified: true });
    expect(tx.recoveryImportedSuppression.upsert).toHaveBeenCalledOnce();

    const tampered = serviceFixture({
      id: "run-2",
      state: "AUDIT_VERIFIED",
      restorePoint,
    });
    await expect(
      tampered.service.importJournal(
        actor,
        "run-2",
        [{ ...unsigned, signature: "b".repeat(64) }],
        "recovery-journal-tampered-key",
      ),
    ).rejects.toMatchObject({ code: "RECOVERY_JOURNAL_SIGNATURE_INVALID" });
  });
});
