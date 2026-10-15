import { describe, expect, it, vi } from "vitest";
import {
  canonicalOperation,
  operationFingerprint,
} from "../../../src/common/domain/canonical-operation";
import { requireRetentionAdapter } from "../../../src/retention/retention-adapters";
import { notificationContracts } from "../../../src/common/domain/operational-notification";
import { OperationIntentsController } from "../../../src/operations/operation-intents.controller";
describe("remaining closure contracts", () => {
  it("canonicalizes object keys recursively without changing array order", () => {
    expect(operationFingerprint({ b: { d: 2, c: 1 }, a: [1, 2] })).toBe(
      operationFingerprint({ a: [1, 2], b: { c: 1, d: 2 } }),
    );
    expect(operationFingerprint({ a: [1, 2] })).not.toBe(
      operationFingerprint({ a: [2, 1] }),
    );
    expect(
      canonicalOperation({ date: new Date("2026-10-13"), absent: undefined }),
    ).toBe('{"date":"2026-10-13T00:00:00.000Z"}');
  });
  it("rejects categories and actions without an executable adapter", () => {
    expect(() => requireRetentionAdapter("LOGS", "TechnicalLog")).toThrow();
    expect(() => requireRetentionAdapter("EXPEDIENTE", "Expediente")).toThrow();
    expect(() =>
      requireRetentionAdapter(
        "ASISTENCIA_HORAS",
        "AttendanceSignals",
        "ELIMINAR",
      ),
    ).toThrow();
    expect(
      requireRetentionAdapter("VISITAS", "VisitEvidence").institutional,
    ).toBe(true);
  });
  it("forbids private or arbitrary fields on the added operational events", () => {
    expect(
      notificationContracts.SERVICE_PERIOD_CHANGED.safeParse({
        periodId: "p",
        estado: "CERRADO",
        version: 2,
        hours: 480,
      }).success,
    ).toBe(false);
    expect(
      notificationContracts.LIBRARY_PUBLISHED.safeParse({
        documentId: "d",
        versionId: "v",
        requiresAcknowledgement: true,
        token: "private",
      }).success,
    ).toBe(false);
  });
  it.each([
    { receipts: [] },
    { receipts: [{ source: "domain", committedAt: new Date() }] },
  ])(
    "returns only self-owned commit metadata, never stored private responses",
    async ({ receipts }) => {
      const actor: any = {
        id: 1,
        rol: "PRESTADOR",
        estado: "ACTIVA",
        sedeId: 2,
        areaId: 3,
      };
      const tx: any = {
        $queryRaw: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce(receipts),
        usuario: { findUnique: vi.fn().mockResolvedValue(actor) },
      };
      const controller = new OperationIntentsController({
        $transaction: vi.fn((fn) => fn(tx)),
      } as any);
      const result = await controller.status(
        { user: actor } as any,
        "synthetic-intent-001",
      );
      expect(result.data.state).toBe(
        receipts.length ? "COMMITTED" : "UNCONFIRMED",
      );
      expect(result.data).not.toHaveProperty("response");
      expect(result.data.semantics).toContain("in-flight");
    },
  );
});
