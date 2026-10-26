import { describe, expect, it, vi } from "vitest";
import { suppressOperationalEvidence } from "../../../src/retention/operational-evidence";

const absenceId = "cabs0000000000000000000001";
const fileId = "cfile000000000000000000001";

function harness(job: Record<string, unknown> | null) {
  const tx: any = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    registroRetencion: { findMany: vi.fn().mockResolvedValue([]) },
    retencionLegal: { count: vi.fn().mockResolvedValue(0) },
    ausencia: {
      findUnique: vi.fn().mockResolvedValue({
        id: absenceId,
        estado: "JUSTIFICADA",
        apelacion: null,
        apelacionLimiteAt: null,
        evidenceSuppressedAt: null,
        justificaciones: [{ archivoId: fileId }],
      }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    archivo: {
      findUnique: vi.fn().mockResolvedValue({
        id: fileId,
        _count: {
          documentoVersiones: 0,
          kairosEvidence: 0,
          reportExports: 0,
          trabajosImpresion3D: 0,
        },
        bibliotecaVersion: null,
        activoPublico: null,
      }),
    },
    justificacionAusencia: {
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    apelacionAusencia: {
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    objectDeletionJob: { findUnique: vi.fn().mockResolvedValue(job) },
    absenceOperation: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const db: any = { $transaction: vi.fn((fn: any) => fn(tx)) };
  const deletions: any = {
    prepare: vi.fn().mockResolvedValue({ id: "cjob1" }),
    complete: vi.fn().mockResolvedValue(undefined),
  };
  return { tx, db, deletions };
}

describe("absence evidence suppression with attachments", () => {
  it("prepares a durable intent and keeps the text until the file is gone", async () => {
    const { tx, db, deletions } = harness(null);
    await expect(
      suppressOperationalEvidence(
        db,
        deletions,
        "AbsenceEvidence",
        absenceId,
        tx,
      ),
    ).resolves.toEqual({ deletionJobId: "cjob1" });
    expect(deletions.prepare).toHaveBeenCalledWith(
      tx,
      fileId,
      "ABSENCE_ATTACHMENT",
      absenceId,
    );
    expect(tx.ausencia.update).not.toHaveBeenCalled();
  });

  it("reports an unfinished job instead of redacting", async () => {
    const { tx, db, deletions } = harness({
      id: "cjob2",
      purpose: "ABSENCE_ATTACHMENT",
      resourceId: absenceId,
      state: "DISPATCHED",
    });
    await expect(
      suppressOperationalEvidence(
        db,
        deletions,
        "AbsenceEvidence",
        absenceId,
        tx,
      ),
    ).resolves.toEqual({ deletionJobId: "cjob2" });
    expect(deletions.prepare).not.toHaveBeenCalled();
    expect(tx.ausencia.update).not.toHaveBeenCalled();
  });

  it("redacts text once every attachment job is verified", async () => {
    const { tx, db, deletions } = harness({
      id: "cjob3",
      purpose: "ABSENCE_ATTACHMENT",
      resourceId: absenceId,
      state: "VERIFIED",
    });
    await expect(
      suppressOperationalEvidence(
        db,
        deletions,
        "AbsenceEvidence",
        absenceId,
        tx,
      ),
    ).resolves.toBeUndefined();
    expect(deletions.complete).toHaveBeenCalledWith(tx, "cjob3");
    expect(tx.ausencia.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ motivoResolucion: "[SUPRIMIDO]" }),
      }),
    );
  });

  it("rejects a job that belongs to another purpose or absence", async () => {
    const { tx, db, deletions } = harness({
      id: "cjob4",
      purpose: "REJECTED_FILE",
      resourceId: fileId,
      state: "COMPLETE",
    });
    await expect(
      suppressOperationalEvidence(
        db,
        deletions,
        "AbsenceEvidence",
        absenceId,
        tx,
      ),
    ).rejects.toMatchObject({ code: "OBJECT_DELETION_PURPOSE_MISMATCH" });
    expect(tx.ausencia.update).not.toHaveBeenCalled();
  });

  it("never starts irreversible work outside the retention transaction", async () => {
    const { db, deletions } = harness(null);
    await expect(
      suppressOperationalEvidence(db, deletions, "AbsenceEvidence", absenceId),
    ).rejects.toMatchObject({ code: "OBJECT_DELETION_PROTOCOL_REQUIRED" });
    expect(deletions.prepare).not.toHaveBeenCalled();
  });
});
