import { describe, expect, it, vi } from "vitest";
import { ObjectDeletionService } from "../../../src/storage/object-deletion.service";

const fileId = "cfile000000000000000000001";
const absenceId = "cabs0000000000000000000001";

function harness(
  overrides: {
    status?: string;
    absence?: Record<string, unknown> | null;
    foreign?: number;
    own?: number;
    counts?: Record<string, number>;
    holds?: number;
  } = {},
) {
  const counts = {
    documentoVersiones: 0,
    kairosEvidence: 0,
    trabajosImpresion3D: 0,
    justificacionesAusencia: 1,
    apelacionesAusencia: 0,
    ...(overrides.counts ?? {}),
  };
  const tx: any = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    reporteExportacion: { findMany: vi.fn().mockResolvedValue([]) },
    registroRetencion: { findMany: vi.fn().mockResolvedValue([]) },
    retencionLegal: { count: vi.fn().mockResolvedValue(overrides.holds ?? 0) },
    archivo: {
      findUnique: vi.fn().mockResolvedValue({
        id: fileId,
        status: overrides.status ?? "DISPONIBLE",
        objectKey: "files/a",
        quarantineKey: "quarantine/a",
        detectedMime: "application/pdf",
        _count: counts,
        bibliotecaVersion: null,
        activoPublico: null,
      }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    ausencia: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.absence === undefined
          ? {
              id: absenceId,
              estado: "JUSTIFICADA",
              apelacion: null,
              apelacionLimiteAt: new Date(Date.now() - 1000),
            }
          : overrides.absence,
      ),
    },
    justificacionAusencia: {
      count: vi.fn(({ where }: any) =>
        Promise.resolve(
          where.ausenciaId?.not
            ? (overrides.foreign ?? 0)
            : (overrides.own ?? 1),
        ),
      ),
    },
    apelacionAusencia: { count: vi.fn().mockResolvedValue(0) },
    objectDeletionJob: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(({ data }: any) => Promise.resolve(data)),
    },
  };
  const storage: any = {
    deletionVersions: vi.fn().mockResolvedValue([]),
    deletionNamespace: () => "a".repeat(64),
  };
  const config: any = {
    get: (key: string) =>
      key === "SUPPRESSION_JOURNAL_KEY_VERSION"
        ? "v1"
        : key === "SUPPRESSION_JOURNAL_HMAC_SECRET"
          ? "synthetic-signing-key-at-least-32-characters"
          : "",
  };
  const audit: any = { append: vi.fn().mockResolvedValue(undefined) };
  const service = new ObjectDeletionService({} as any, storage, config, audit);
  return { service, tx, storage, audit };
}

describe("absence attachment deletion intent", () => {
  it("reserves the file and binds the intent to its absence", async () => {
    const { service, tx, audit } = harness();
    const job: any = await service.prepare(
      tx,
      fileId,
      "ABSENCE_ATTACHMENT",
      absenceId,
    );
    expect(job).toMatchObject({
      fileId,
      purpose: "ABSENCE_ATTACHMENT",
      resourceId: absenceId,
      originalStatus: "DISPONIBLE",
    });
    expect(tx.archivo.update).toHaveBeenCalledWith({
      where: { id: fileId },
      data: { status: "ELIMINACION_PENDIENTE" },
    });
    expect(audit.append).toHaveBeenCalled();
  });

  it("requires an owning absence", async () => {
    const { service, tx } = harness();
    await expect(
      service.prepare(tx, fileId, "ABSENCE_ATTACHMENT"),
    ).rejects.toMatchObject({ code: "OBJECT_DELETION_PURPOSE_MISMATCH" });
    expect(tx.objectDeletionJob.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      "another absence references it",
      { foreign: 1 },
      "RETENTION_SHARED_EVIDENCE_OR_HOLD",
    ],
    [
      "a library version references it",
      { counts: { documentoVersiones: 1 } },
      "RETENTION_SHARED_EVIDENCE_OR_HOLD",
    ],
    [
      "a legal hold is active",
      { holds: 1 },
      "RETENTION_SHARED_EVIDENCE_OR_HOLD",
    ],
    [
      "the absence does not own it",
      { own: 0 },
      "OBJECT_DELETION_PURPOSE_MISMATCH",
    ],
    [
      "the file is still being scanned",
      { status: "ANALIZANDO" },
      "RETENTION_RESOURCE_NOT_TERMINAL",
    ],
    [
      "the absence is still open",
      {
        absence: {
          id: absenceId,
          estado: "PENDIENTE",
          apelacion: null,
          apelacionLimiteAt: null,
        },
      },
      "RETENTION_RESOURCE_NOT_TERMINAL",
    ],
    [
      "the appeal window is open",
      {
        absence: {
          id: absenceId,
          estado: "NO_JUSTIFICADA",
          apelacion: null,
          apelacionLimiteAt: new Date(Date.now() + 60000),
        },
      },
      "RETENTION_RESOURCE_NOT_TERMINAL",
    ],
    [
      "the absence is gone",
      { absence: null },
      "RETENTION_RESOURCE_NOT_TERMINAL",
    ],
  ])("fails closed when %s", async (_name, overrides, code) => {
    const { service, tx } = harness(overrides as any);
    await expect(
      service.prepare(tx, fileId, "ABSENCE_ATTACHMENT", absenceId),
    ).rejects.toMatchObject({ code });
    expect(tx.objectDeletionJob.create).not.toHaveBeenCalled();
    expect(tx.archivo.update).not.toHaveBeenCalled();
  });

  it("keeps absence attachments out of the rejected-file purpose", async () => {
    const { service, tx } = harness({ status: "RECHAZADO" });
    await expect(
      service.prepare(tx, fileId, "REJECTED_FILE", fileId),
    ).rejects.toMatchObject({ code: "RETENTION_SHARED_EVIDENCE_OR_HOLD" });
  });
});
