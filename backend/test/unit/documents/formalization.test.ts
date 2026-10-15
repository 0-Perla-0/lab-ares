import { describe, expect, it, vi } from "vitest";
import { DocumentsService } from "../../../src/documents/documents.service";
import { formalizationSchema } from "../../../src/documents/documents.schemas";
import { DomainTransaction } from "../../../src/common/domain/domain-transaction";
import { runtimeGrants } from "../../../src/scripts/provision-runtime-db";

function make() {
  const actor: any = {
    id: 1,
    rol: "ADMIN",
    estado: "ACTIVA",
    sedeId: 3,
    areaId: 4,
  };
  const subject: any = {
    id: 2,
    rol: "PRESTADOR",
    estado: "ACTIVA",
    sedeId: 3,
    areaId: 4,
  };
  const academic: any = {
    id: 7,
    institucionId: 8,
    programaAcademicoId: 9,
    cohorteId: null,
    institucion: { activa: true, nombre: "Institución" },
    unidadAcademica: null,
    cohorte: null,
    programaAcademico: {
      activa: true,
      nombre: "Programa",
      unidadAcademicaId: 10,
      unidadAcademica: { activa: true, institucionId: 8, nombre: "Unidad" },
    },
  };
  const receipts = new Map<string, any>();
  const tx: any = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    recoveryWriteBarrier: {
      findUnique: vi.fn().mockResolvedValue({ active: false }),
    },
    usuario: {
      findUnique: vi
        .fn()
        .mockImplementation(({ where }) => (where.id === 1 ? actor : subject)),
    },
    domainOperation: {
      findUnique: vi
        .fn()
        .mockImplementation(
          ({ where }) => receipts.get(where.actorId_key.key) ?? null,
        ),
      create: vi.fn().mockImplementation(({ data }) => {
        receipts.set(data.key, data);
        return data;
      }),
    },
    adscripcionAcademica: {
      findFirst: vi.fn().mockResolvedValue(academic),
      findUniqueOrThrow: vi.fn().mockResolvedValue(academic),
    },
    requisitoDocumento: { findMany: vi.fn().mockResolvedValue([]) },
    formalizacionExpediente: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => ({
        id: "formalization",
        ...data,
        createdAt: new Date(),
      })),
      findMany: vi.fn().mockResolvedValue([]),
    },
    notification: { create: vi.fn().mockResolvedValue({ id: "notice" }) },
    outboxEvent: { create: vi.fn() },
  };
  const db: any = { ...tx, $transaction: vi.fn((fn) => fn(tx)) };
  const audit: any = { append: vi.fn() };
  const features: any = { requireInTransaction: vi.fn() };
  const service = new DocumentsService(db, {} as any, audit, features);
  return { actor, subject, academic, tx, db, audit, features, service };
}
const input = { usuarioId: 2, inicio: "2026-10-12" };
const key = "formalization-key-123456";
describe("immutable academic-gated expedient formalization", () => {
  it("validates exact civil dates and rejects extra fields", () => {
    expect(formalizationSchema.safeParse(input).success).toBe(true);
    expect(
      formalizationSchema.safeParse({ ...input, inicio: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      formalizationSchema.safeParse({ ...input, approveHours: true }).success,
    ).toBe(false);
  });
  it("records snapshots, audit and a reference-only outbox in the same transaction", async () => {
    const h = make();
    const result = await h.service.formalize(h.actor, key, input);
    expect(result.academicSnapshot).toMatchObject({
      adscripcionId: 7,
      programa: "Programa",
    });
    expect(h.tx.adscripcionAcademica.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estado: "CONFIRMADA",
          vigente: true,
          inicio: { lte: new Date("2026-10-12T00:00:00Z") },
        }),
      }),
    );
    expect(h.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EXPEDIENT_FORMALIZED" }),
      h.tx,
    );
    expect(h.tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        type: "OPERATIONAL_NOTIFICATION",
        aggregateId: "notice",
        payload: { notificationId: "notice" },
      },
    });
  });
  it("replays an unchanged intent without re-formalizing or replacing its snapshot", async () => {
    const h = make();
    const first = await h.service.formalize(h.actor, key, input);
    h.academic.programaAcademico.nombre = "Changed";
    expect(await h.service.formalize(h.actor, key, input)).toEqual(first);
    expect(h.tx.formalizacionExpediente.create).toHaveBeenCalledOnce();
    expect(h.audit.append).toHaveBeenCalledOnce();
  });
  it("rejects reuse with a changed date and emits no second business event", async () => {
    const h = make();
    await h.service.formalize(h.actor, key, input);
    await expect(
      h.service.formalize(h.actor, key, { ...input, inicio: "2026-10-13" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(h.audit.append).toHaveBeenCalledOnce();
  });
  it("requires confirmed academic coverage, never infers it from the current user", async () => {
    const h = make();
    h.tx.adscripcionAcademica.findFirst.mockResolvedValue(null);
    await expect(
      h.service.formalize(h.actor, key, input),
    ).rejects.toMatchObject({ code: "ACADEMIC_FORMALIZATION_REQUIRED" });
    expect(h.tx.formalizacionExpediente.create).not.toHaveBeenCalled();
  });
  it("revalidates active consistent catalogs under locks", async () => {
    const h = make();
    h.academic.programaAcademico.unidadAcademica.institucionId = 999;
    await expect(
      h.service.formalize(h.actor, key, input),
    ).rejects.toMatchObject({ code: "ACADEMIC_REFERENCE_CHANGED" });
    expect(h.tx.formalizacionExpediente.create).not.toHaveBeenCalled();
  });
  it("blocks duplicate user/start dates under a different intent", async () => {
    const h = make();
    h.tx.formalizacionExpediente.findUnique.mockResolvedValue({
      id: "previous",
    });
    await expect(
      h.service.formalize(h.actor, key, input),
    ).rejects.toMatchObject({ code: "EXPEDIENT_ALREADY_FORMALIZED" });
  });
  it("does not expose a receipt after target deactivation", async () => {
    const h = make();
    await h.service.formalize(h.actor, key, input);
    h.subject.estado = "DESACTIVADA";
    await expect(
      h.service.formalize(h.actor, key, input),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
  });
  it("rejects cross-area review and current actor changes", async () => {
    const h = make();
    h.actor.rol = "COORDINADOR";
    h.subject.areaId = 99;
    await expect(
      h.service.formalize(h.actor, key, input),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    const stale = { ...h.actor, rol: "ADMIN" };
    await expect(h.service.formalize(stale, key, input)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("fails closed during recovery before touching the actor or formalization", async () => {
    const h = make();
    h.tx.recoveryWriteBarrier.findUnique.mockResolvedValue({ active: true });
    await expect(
      h.service.formalize(h.actor, key, input),
    ).rejects.toMatchObject({ code: "RECOVERY_WRITE_BARRIER_ACTIVE" });
    expect(h.tx.formalizacionExpediente.create).not.toHaveBeenCalled();
  });
  it("allows authorized replay when new formalizations are paused", async () => {
    const h = make();
    const first = await h.service.formalize(h.actor, key, input);
    h.features.requireInTransaction.mockRejectedValue(new Error("paused"));
    expect(await h.service.formalize(h.actor, key, input)).toEqual(first);
    await expect(
      h.service.formalize(h.actor, "new-intent-key-123456", input),
    ).rejects.toThrow("paused");
  });
  it("serializes safe BigInt receipts without modifying global prototypes", async () => {
    const h = make();
    const domain = new DomainTransaction(h.db);
    expect(
      await domain.run(h.actor, key, { action: "TEST" }, async () => ({
        size: 1024n,
        large: 9007199254740992n,
      })),
    ).toEqual({ size: 1024, large: "9007199254740992" });
  });
  it("provisions SELECT/INSERT only for immutable formalizations", () => {
    expect(
      runtimeGrants("ares_test", "ares_runtime_test", "%", [
        "FormalizacionExpediente",
      ])[0],
    ).toContain("GRANT SELECT, INSERT ON");
  });
});
