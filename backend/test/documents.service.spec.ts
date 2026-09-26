import { describe, expect, it, vi } from "vitest";
import { DocumentsService } from "../src/documents/documents.service";
import { listQuerySchema, requirementSchema, reviewSchema, uploadSchema } from "../src/documents/documents.schemas";
import { EstadoArchivo, EstadoDocumento, EstadoUsuario } from "../src/generated/prisma/enums";
import type { AuthUser } from "../src/auth/auth-user";

const actor = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 10, codigo: "P10", email: "p10@example.test", rol: "PRESTADOR", estado: EstadoUsuario.ACTIVA,
  sedeId: 1, areaId: 2, turnoId: null, ...overrides,
});

const requirement = (overrides: Record<string, unknown> = {}) => ({
  id: 7, usuarioId: 10, activo: true, usuario: { id: 10, sedeId: 1, areaId: 2, estado: EstadoUsuario.ACTIVA }, ...overrides,
});

function harness() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    requisitoDocumento: { create: vi.fn(), findUnique: vi.fn() },
    documentoVersion: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    archivo: { findUnique: vi.fn() },
  };
  const prisma = {
    requisitoDocumento: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    usuario: { findUnique: vi.fn() },
    archivo: { findUnique: vi.fn() },
    documentoVersion: { findUnique: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const storage = { downloadUrl: vi.fn().mockResolvedValue("https://download.test/capability") };
  const audit = { append: vi.fn().mockResolvedValue(undefined) };
  return { service: new DocumentsService(prisma as never, storage as never, audit as never), prisma, tx, storage, audit };
}

describe("document requirement and version policies", () => {
  it("only allows GLOBAL actors to create requirements for active PRESTADOR users", async () => {
    const h = harness();
    h.prisma.usuario.findUnique.mockResolvedValue({ id: 20, rol: "PRESTADOR", estado: EstadoUsuario.ACTIVA });
    h.prisma.requisitoDocumento.create.mockResolvedValue({ id: 1 });
    h.tx.requisitoDocumento.create.mockResolvedValue({ id: 1 });
    await expect(h.service.createRequirement(actor({ rol: "ADMIN" }), { usuarioId: 20, codigo: "INE", nombre: "Identificación", obligatorio: true })).resolves.toEqual({ id: 1 });
    expect(h.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "DOCUMENT_REQUIREMENT_CREATED", metadata: { result: "created" } }), h.tx);
    await expect(h.service.createRequirement(actor(), { usuarioId: 20, codigo: "INE", nombre: "Identificación", obligatorio: true })).rejects.toThrow();
    h.prisma.usuario.findUnique.mockResolvedValue({ id: 20, rol: "COORDINADOR", estado: EstadoUsuario.ACTIVA });
    await expect(h.service.createRequirement(actor({ rol: "ADMIN" }), { usuarioId: 20, codigo: "X", nombre: "X", obligatorio: true })).rejects.toThrow();
  });

  it("increments immutable versions inside a row lock and keeps uploader identity", async () => {
    const h = harness();
    h.prisma.requisitoDocumento.findUnique.mockResolvedValue(requirement());
    h.prisma.archivo.findUnique.mockResolvedValue({ id: "file-1", status: EstadoArchivo.DISPONIBLE, detectedMime: "application/pdf", propietarioId: 10 });
    h.tx.requisitoDocumento.findUnique.mockResolvedValue(requirement());
    h.tx.archivo.findUnique.mockResolvedValue({ id: "file-1", status: EstadoArchivo.DISPONIBLE, detectedMime: "application/pdf", propietarioId: 10 });
    h.tx.documentoVersion.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ version: 3 });
    h.tx.documentoVersion.create.mockResolvedValue({ id: "v4", version: 4, estado: EstadoDocumento.EN_REVISION, cargadoPorId: 10 });
    const result = await h.service.upload(actor(), { requisitoId: 7, archivoId: "file-1" });
    expect(result).toMatchObject({ version: 4, estado: EstadoDocumento.EN_REVISION, cargadoPorId: 10 });
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(h.tx.documentoVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ version: 4, archivoId: "file-1" }) });
    expect(h.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "DOCUMENT_VERSION_UPLOADED", metadata: expect.not.objectContaining({ passwordHash: expect.anything(), objectKey: expect.anything() }) }), h.tx);
  });

  it("rejects an inactive or missing requirement uniformly", async () => {
    const h = harness();
    h.prisma.requisitoDocumento.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(requirement({ activo: false })).mockResolvedValueOnce(requirement({ usuario: { id: 10, sedeId: 1, areaId: 2, estado: EstadoUsuario.SUSPENDIDA } }));
    await expect(h.service.upload(actor(), { requisitoId: 7, archivoId: "x" })).rejects.toThrow();
    await expect(h.service.upload(actor(), { requisitoId: 7, archivoId: "x" })).rejects.toThrow();
    await expect(h.service.upload(actor(), { requisitoId: 7, archivoId: "x" })).rejects.toThrow();
  });

  it("rejects a second pending version before calculating the next number", async () => {
    const h = harness();
    h.prisma.requisitoDocumento.findUnique.mockResolvedValue(requirement());
    h.prisma.archivo.findUnique.mockResolvedValue({ id: "f", status: EstadoArchivo.DISPONIBLE, detectedMime: "image/png" });
    h.tx.documentoVersion.findFirst.mockResolvedValueOnce({ id: "pending", estado: EstadoDocumento.EN_REVISION });
    await expect(h.service.upload(actor(), { requisitoId: 7, archivoId: "f" })).rejects.toThrow();
    expect(h.tx.documentoVersion.create).not.toHaveBeenCalled();
  });

  it("rejects uploads from another user, unavailable files, and non-document MIME types", async () => {
    const h = harness();
    h.prisma.requisitoDocumento.findUnique.mockResolvedValue(requirement());
    await expect(h.service.upload(actor({ id: 11 }), { requisitoId: 7, archivoId: "x" })).rejects.toThrow();
    h.prisma.archivo.findUnique.mockResolvedValue({ id: "x", status: EstadoArchivo.RECHAZADO, detectedMime: "application/pdf" });
    await expect(h.service.upload(actor(), { requisitoId: 7, archivoId: "x" })).rejects.toThrow();
    h.prisma.archivo.findUnique.mockResolvedValue({ id: "x", status: EstadoArchivo.DISPONIBLE, detectedMime: "application/zip" });
    await expect(h.service.upload(actor(), { requisitoId: 7, archivoId: "x" })).rejects.toThrow();
  });

  it("locks requirement and file rows in the same transaction and persists the actor as uploader", async () => {
    const h = harness();
    h.tx.requisitoDocumento.findUnique.mockResolvedValue(requirement());
    h.tx.archivo.findUnique.mockResolvedValue({ id: "owned", status: EstadoArchivo.DISPONIBLE, detectedMime: "application/pdf", propietarioId: 10 });
    h.tx.documentoVersion.findFirst.mockResolvedValue(null);
    h.tx.documentoVersion.create.mockResolvedValue({ id: "v1", version: 1, cargadoPorId: 10 });
    await h.service.upload(actor(), { requisitoId: 7, archivoId: "owned" });
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(h.tx.documentoVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ requisitoId: 7, archivoId: "owned", cargadoPorId: 10 }) });
    expect(h.audit.append).toHaveBeenCalledWith(expect.objectContaining({ actorId: 10, resource: "document_version" }), h.tx);
  });

  it.each([
    ["foreign", { id: "f", status: EstadoArchivo.DISPONIBLE, detectedMime: "application/pdf", propietarioId: 99 }],
    ["unavailable", { id: "f", status: EstadoArchivo.RECHAZADO, detectedMime: "application/pdf", propietarioId: 10 }],
    ["mime", { id: "f", status: EstadoArchivo.DISPONIBLE, detectedMime: "application/zip", propietarioId: 10 }],
    ["missing", null],
  ])("rejects %s file without creating a document version", async (_label, file) => {
    const h = harness();
    h.tx.requisitoDocumento.findUnique.mockResolvedValue(requirement());
    h.tx.archivo.findUnique.mockResolvedValue(file);
    await expect(h.service.upload(actor(), { requisitoId: 7, archivoId: "f" })).rejects.toThrow();
    expect(h.tx.documentoVersion.create).not.toHaveBeenCalled();
    expect(h.audit.append).not.toHaveBeenCalled();
  });

  it("does not audit or persist when the transaction callback fails", async () => {
    const h = harness();
    h.tx.requisitoDocumento.findUnique.mockResolvedValue(requirement());
    h.tx.archivo.findUnique.mockResolvedValue({ id: "f", status: EstadoArchivo.DISPONIBLE, detectedMime: "application/pdf", propietarioId: 10 });
    h.tx.documentoVersion.findFirst.mockResolvedValue(null);
    h.tx.documentoVersion.create.mockRejectedValue(new Error("rollback"));
    await expect(h.service.upload(actor(), { requisitoId: 7, archivoId: "f" })).rejects.toThrow("rollback");
    expect(h.audit.append).not.toHaveBeenCalled();
  });

  it.each([EstadoArchivo.PENDIENTE_ANALISIS, EstadoArchivo.ANALIZANDO, EstadoArchivo.RECHAZADO, EstadoArchivo.ERROR_ANALISIS, EstadoArchivo.ELIMINADO])("rejects technical file state %s", async (status) => {
    const h = harness();
    h.prisma.requisitoDocumento.findUnique.mockResolvedValue(requirement());
    h.prisma.archivo.findUnique.mockResolvedValue({ id: "x", status, detectedMime: "application/pdf" });
    await expect(h.service.upload(actor(), { requisitoId: 7, archivoId: "x" })).rejects.toThrow();
  });

  it.each(["application/zip", "text/plain", "image/gif", "application/octet-stream"])("rejects disallowed document MIME %s", async (detectedMime) => {
    const h = harness();
    h.prisma.requisitoDocumento.findUnique.mockResolvedValue(requirement());
    h.prisma.archivo.findUnique.mockResolvedValue({ id: "x", status: EstadoArchivo.DISPONIBLE, detectedMime });
    await expect(h.service.upload(actor(), { requisitoId: 7, archivoId: "x" })).rejects.toThrow();
  });

  it("clamps list pagination and applies deterministic skip/take", async () => {
    const h = harness();
    h.prisma.usuario.findUnique.mockResolvedValue({ id: 10, sedeId: 1, areaId: 2, estado: EstadoUsuario.ACTIVA });
    h.prisma.requisitoDocumento.findMany.mockResolvedValue([]); h.prisma.requisitoDocumento.count.mockResolvedValue(0);
    await expect(h.service.list(actor(), 10, 0, 500)).resolves.toMatchObject({ page: 1, pageSize: 100 });
    expect(h.prisma.requisitoDocumento.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100 }));
  });

  it.each([
    ["SELF", actor(), { id: 10, sedeId: 1, areaId: 2, estado: EstadoUsuario.ACTIVA }, true],
    ["AREA", actor({ rol: "COORDINADOR" }), { id: 20, sedeId: 1, areaId: 2, estado: EstadoUsuario.ACTIVA }, true],
    ["SEDE", actor({ rol: "JEFE_SEDE" }), { id: 20, sedeId: 1, areaId: 99, estado: EstadoUsuario.ACTIVA }, true],
    ["GLOBAL", actor({ rol: "ADMIN" }), { id: 99, sedeId: 99, areaId: 99, estado: EstadoUsuario.ACTIVA }, true],
    ["cross scope", actor({ rol: "COORDINADOR" }), { id: 20, sedeId: 1, areaId: 9, estado: EstadoUsuario.ACTIVA }, false],
  ])("enforces %s read scope", async (_name, current, target, allowed) => {
    const h = harness();
    h.prisma.usuario.findUnique.mockResolvedValue(target);
    h.prisma.requisitoDocumento.findMany.mockResolvedValue([]);
    h.prisma.requisitoDocumento.count.mockResolvedValue(0);
    const result = h.service.list(current as never, target.id);
    if (allowed) await expect(result).resolves.toMatchObject({ total: 0 }); else await expect(result).rejects.toThrow();
  });
});

describe("document review and download policies", () => {
  const version = (overrides: Record<string, unknown> = {}) => ({ id: "v1", cargadoPorId: 10, estado: EstadoDocumento.EN_REVISION, requisito: { usuario: { id: 10, sedeId: 1, areaId: 2, estado: EstadoUsuario.ACTIVA } }, ...overrides });

  it("separates uploader and reviewer and locks the review for idempotent double review", async () => {
    const h = harness();
    h.prisma.documentoVersion.findUnique.mockResolvedValue(version());
    await expect(h.service.review(actor(), "v1", { estado: "AUTORIZADO" })).rejects.toThrow();
    h.prisma.documentoVersion.findUnique.mockResolvedValue(version());
    h.tx.documentoVersion.findUnique.mockResolvedValue(version());
    h.tx.documentoVersion.update.mockResolvedValue({ id: "v1", estado: EstadoDocumento.AUTORIZADO });
    await expect(h.service.review(actor({ id: 20, rol: "COORDINADOR" }), "v1", { estado: "AUTORIZADO" })).resolves.toMatchObject({ estado: EstadoDocumento.AUTORIZADO });
    h.tx.documentoVersion.findUnique.mockResolvedValue(version({ estado: EstadoDocumento.AUTORIZADO }));
    await expect(h.service.review(actor({ id: 21, rol: "COORDINADOR" }), "v1", { estado: "AUTORIZADO" })).rejects.toThrow();
    expect(h.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "DOCUMENT_VERSION_REVIEWED", metadata: { result: "AUTORIZADO" } }), h.tx);
    expect(h.tx.$executeRaw).toHaveBeenCalled();
  });

  it("revalidates reviewer scope and target status inside the locked transaction", async () => {
    const h = harness();
    h.tx.documentoVersion.findUnique.mockResolvedValue(version({ estado: EstadoDocumento.EN_REVISION }));
    h.tx.documentoVersion.update.mockResolvedValue({ id: "v1", estado: EstadoDocumento.AUTORIZADO });
    await expect(h.service.review(actor({ id: 20, rol: "COORDINADOR" }), "v1", { estado: "AUTORIZADO" })).resolves.toMatchObject({ estado: EstadoDocumento.AUTORIZADO });
    expect(h.tx.documentoVersion.findUnique).toHaveBeenCalled();
    expect(h.tx.$executeRaw).toHaveBeenCalled();
    h.tx.documentoVersion.findUnique.mockResolvedValue(version({ estado: EstadoDocumento.EN_REVISION, requisito: { usuario: { id: 10, sedeId: 99, areaId: 99, estado: EstadoUsuario.ACTIVA } } }));
    await expect(h.service.review(actor({ id: 20, rol: "COORDINADOR" }), "v1", { estado: "AUTORIZADO" })).rejects.toThrow();
    expect(h.tx.documentoVersion.update).toHaveBeenCalledTimes(1);
  });

  it("rejects review for inactive target and every non-pending state", async () => {
    const h = harness();
    h.prisma.documentoVersion.findUnique.mockResolvedValue(version({ requisito: { usuario: { id: 10, sedeId: 1, areaId: 2, estado: EstadoUsuario.DESACTIVADA } } }));
    await expect(h.service.review(actor({ id: 20, rol: "COORDINADOR" }), "v1", { estado: "AUTORIZADO" })).rejects.toThrow();
    for (const state of [EstadoDocumento.AUTORIZADO, EstadoDocumento.RECHAZADO, EstadoDocumento.REQUIERE_CORRECCION, EstadoDocumento.CANCELADO]) {
      h.prisma.documentoVersion.findUnique.mockResolvedValue(version({ estado: state }));
      await expect(h.service.review(actor({ id: 20, rol: "COORDINADOR" }), "v1", { estado: "AUTORIZADO" })).rejects.toThrow();
    }
  });

  it("requires feedback for rejection/correction and rejects invalid review transitions", () => {
    expect(reviewSchema.safeParse({ estado: "RECHAZADO" }).success).toBe(false);
    expect(reviewSchema.safeParse({ estado: "REQUIERE_CORRECCION", comentario: "Falta firma" }).success).toBe(true);
    expect(reviewSchema.safeParse({ estado: "AUTORIZADO" }).success).toBe(true);
    expect(reviewSchema.safeParse({ estado: "CANCELADO" }).success).toBe(false);
  });

  it("does not issue a download URL for pending, rejected, cancelled, inactive, or unrelated documents", async () => {
    const h = harness();
    for (const state of [EstadoDocumento.EN_REVISION, EstadoDocumento.RECHAZADO, EstadoDocumento.REQUIERE_CORRECCION, EstadoDocumento.CANCELADO]) {
      h.prisma.documentoVersion.findUnique.mockResolvedValue(version({ estado: state }));
      await expect(h.service.download(actor(), "v1")).rejects.toThrow();
    }
    h.prisma.documentoVersion.findUnique.mockResolvedValue(version({ estado: EstadoDocumento.AUTORIZADO, requisito: { usuario: { id: 99, sedeId: 9, areaId: 9, estado: EstadoUsuario.ACTIVA } } }));
    await expect(h.service.download(actor(), "v1")).rejects.toThrow();
    h.prisma.documentoVersion.findUnique.mockResolvedValue(version({ estado: EstadoDocumento.AUTORIZADO }));
    await expect(h.service.download(actor({ estado: EstadoUsuario.SUSPENDIDA }), "v1")).rejects.toThrow();
  });

  it("issues a capability-bound download URL only for an authorized document", async () => {
    const h = harness();
    h.prisma.documentoVersion.findUnique.mockResolvedValue(version({ estado: EstadoDocumento.AUTORIZADO, archivoId: "file-1", archivo: { id: "file-1" } }));
    h.tx.documentoVersion.findUnique.mockResolvedValue(version({ estado: EstadoDocumento.AUTORIZADO, archivoId: "file-1", archivo: { id: "file-1" } }));
    await expect(h.service.download(actor(), "v1")).resolves.toBe("https://download.test/capability");
    expect(h.storage.downloadUrl).toHaveBeenCalledWith("file-1", expect.anything(), "10");
    expect(h.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "DOCUMENT_DOWNLOAD_REQUESTED", metadata: { result: "authorized" } }), h.tx);
  });

  it("does not download a missing or inactive target and records no audit for denied access", async () => {
    const h = harness();
    h.prisma.documentoVersion.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(version({ requisito: { usuario: { id: 10, sedeId: 1, areaId: 2, estado: EstadoUsuario.BLOQUEADA } } }));
    await expect(h.service.download(actor(), "missing")).rejects.toThrow();
    await expect(h.service.download(actor(), "v1")).rejects.toThrow();
    expect(h.audit.append).not.toHaveBeenCalled();
  });
});

describe("document input and file allowlist contracts", () => {
  it("accepts only positive requirement ids and bounded names", () => {
    expect(requirementSchema.safeParse({ usuarioId: 1, codigo: "CURP", nombre: "CURP" }).success).toBe(true);
    expect(requirementSchema.safeParse({ usuarioId: 0, codigo: "CURP", nombre: "CURP" }).success).toBe(false);
    expect(requirementSchema.safeParse({ usuarioId: 1, codigo: "", nombre: "CURP" }).success).toBe(false);
  });

  it("accepts only positive requirement ids and non-empty file ids", () => {
    const valid = "0123456789abcdef0123456789abcd";
    expect(uploadSchema.safeParse({ requisitoId: 1, archivoId: valid }).success).toBe(true);
    expect(uploadSchema.safeParse({ requisitoId: 0, archivoId: valid }).success).toBe(false);
    expect(uploadSchema.safeParse({ requisitoId: 1, archivoId: "" }).success).toBe(false);
    expect(uploadSchema.safeParse({ requisitoId: 1, archivoId: valid.slice(0, 29) }).success).toBe(false);
    expect(uploadSchema.safeParse({ requisitoId: 1, archivoId: valid.toUpperCase() }).success).toBe(false);
    expect(uploadSchema.safeParse({ requisitoId: 1, archivoId: `${valid.slice(0, 29)}g` }).success).toBe(false);
  });

  it("normalizes list pagination and rejects invalid query values", () => {
    expect(listQuerySchema.parse({ page: "2", pageSize: "100", userId: "9" })).toEqual({ page: 2, pageSize: 100, userId: 9 });
    expect(listQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(listQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
    expect(listQuerySchema.safeParse({ userId: "-1" }).success).toBe(false);
  });

  it("redacts sensitive fields from list selections", async () => {
    const h = harness();
    h.prisma.usuario.findUnique.mockResolvedValue({ id: 10, sedeId: 1, areaId: 2, estado: EstadoUsuario.ACTIVA });
    h.prisma.requisitoDocumento.findMany.mockResolvedValue([]);
    h.prisma.requisitoDocumento.count.mockResolvedValue(0);
    await h.service.list(actor());
    const query = h.prisma.requisitoDocumento.findMany.mock.calls[0][0];
    const raw = JSON.stringify(query);
    expect(raw).not.toMatch(/objectKey|quarantineKey|leaseOwner|lastError|passwordHash/);
  });
});
