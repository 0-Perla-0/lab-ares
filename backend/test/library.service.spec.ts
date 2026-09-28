import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../src/auth/auth-user";
import {
  AlcanceBiblioteca,
  CategoriaBiblioteca,
  EstadoArchivo,
  EstadoBiblioteca,
  EstadoUsuario,
  RolMiembroProyectoKairos,
  RolUsuario,
} from "../src/generated/prisma/enums";
import { LibraryService } from "../src/library/library.service";
import {
  archiveLibraryDocumentSchema,
  createLibraryDocumentSchema,
  createLibraryVersionSchema,
  listLibrarySchema,
  publishLibraryVersionSchema,
  reviewLibraryVersionSchema,
} from "../src/library/library.schemas";

const documentId = "cmabcdefghijklmnopqrstuvwx";
const versionId = "cnabcdefghijklmnopqrstuvwx";
const previousVersionId = "coabcdefghijklmnopqrstuvwx";
const projectId = "cpabcdefghijklmnopqrstuvwx";
const fileId = "a".repeat(30);
const actor = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 7,
  codigo: "U7",
  email: "u7@example.test",
  rol: RolUsuario.COORDINADOR,
  estado: EstadoUsuario.ACTIVA,
  sedeId: 20,
  areaId: 10,
  turnoId: null,
  ...overrides,
});
const document = {
  id: documentId,
  titulo: "Manual",
  descripcion: null,
  categoria: CategoriaBiblioteca.MANUAL,
  alcance: AlcanceBiblioteca.AREA,
  estado: EstadoBiblioteca.BORRADOR,
  requiereAcuse: true,
  sedeId: 20,
  areaId: 10,
  proyectoId: null,
  creadoPorId: 7,
};
const version = {
  id: versionId,
  documentoId: documentId,
  numero: 1,
  estado: EstadoBiblioteca.BORRADOR,
  archivoId: fileId,
  autorId: 7,
  revisadoPorId: null,
  publicadoPorId: null,
  resumenCambios: "Primera versión",
  retroalimentacion: null,
  motivoSustitucion: null,
  vigenteDesde: null,
  vigenteHasta: null,
  submittedAt: null,
  reviewedAt: null,
  publishedAt: null,
  archivedAt: null,
  documento: document,
  archivo: { id: fileId, status: EstadoArchivo.DISPONIBLE },
};

function make(overrides: any = {}) {
  const base: any = {
    sede: { findFirst: vi.fn().mockResolvedValue({ id: 20 }) },
    area: { findFirst: vi.fn().mockResolvedValue({ id: 10, sedeId: 20 }) },
    proyectoKairos: {
      findUnique: vi.fn().mockResolvedValue({ id: projectId }),
    },
    miembroProyectoKairos: {
      findFirst: vi.fn().mockResolvedValue({
        usuarioId: 7,
        rol: RolMiembroProyectoKairos.PROPIETARIO,
      }),
      findMany: vi.fn().mockResolvedValue([{ usuarioId: 7 }, { usuarioId: 8 }]),
    },
    archivo: {
      findFirst: vi.fn().mockResolvedValue({
        id: fileId,
        extension: "pdf",
        detectedMime: "application/pdf",
        sizeBytes: BigInt(1024),
      }),
    },
    documentoBiblioteca: {
      findMany: vi.fn().mockResolvedValue([document]),
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue(document),
      findUnique: vi.fn().mockResolvedValue(document),
      create: vi.fn().mockResolvedValue({ ...document, versiones: [version] }),
      update: vi
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve({ ...document, ...data }),
        ),
    },
    versionBiblioteca: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(version),
      aggregate: vi.fn().mockResolvedValue({ _max: { numero: 1 } }),
      create: vi
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve({ id: versionId, ...data }),
        ),
      update: vi
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve({ ...version, ...data }),
        ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
    usuario: { findMany: vi.fn().mockResolvedValue([{ id: 7 }, { id: 8 }]) },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    acuseBiblioteca: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "cqabcdefghijklmnopqrstuvwx",
        versionId,
        usuarioId: 7,
        acknowledgedAt: new Date(),
      }),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const db: any = { ...base, ...(overrides.db ?? {}) };
  for (const key of [
    "sede",
    "area",
    "proyectoKairos",
    "miembroProyectoKairos",
    "archivo",
    "documentoBiblioteca",
    "versionBiblioteca",
    "usuario",
    "notification",
    "acuseBiblioteca",
  ])
    db[key] = { ...base[key], ...(overrides.db?.[key] ?? {}) };
  db.$transaction =
    overrides.db?.$transaction ??
    vi.fn((value: any) =>
      Array.isArray(value) ? Promise.all(value) : value(db),
    );
  const storage = {
    downloadUrl: vi
      .fn()
      .mockResolvedValue({ url: "private-url", expiresIn: 300 }),
  };
  const audit = { append: vi.fn().mockResolvedValue(undefined) };
  const config = {
    get: vi.fn((key: string) =>
      key === "LIBRARY_MAX_BYTES" ? 25 * 1024 * 1024 : undefined,
    ),
  };
  return {
    service: new LibraryService(
      db,
      storage as any,
      audit as any,
      config as any,
    ),
    db,
    storage,
    audit,
  };
}

const createInput = {
  titulo: "Manual",
  categoria: "MANUAL" as const,
  alcance: "AREA" as const,
  sedeId: 20,
  areaId: 10,
  requiereAcuse: true,
  archivoId: fileId,
  resumenCambios: "Primera versión",
};

describe("operational library contracts", () => {
  beforeEach(() => vi.useRealTimers());

  it("validates strict scope dimensions, dates, workflow bodies and pagination", () => {
    expect(createLibraryDocumentSchema.safeParse(createInput).success).toBe(
      true,
    );
    expect(
      createLibraryDocumentSchema.safeParse({
        ...createInput,
        alcance: "GLOBAL",
        sedeId: 20,
        areaId: undefined,
      }).success,
    ).toBe(false);
    expect(
      createLibraryVersionSchema.safeParse({
        archivoId: fileId,
        resumenCambios: "x",
        vigenteDesde: "2026-02-01T00:00:00Z",
        vigenteHasta: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      reviewLibraryVersionSchema.safeParse({ decision: "REQUEST_CHANGES" })
        .success,
    ).toBe(false);
    expect(publishLibraryVersionSchema.safeParse({ extra: true }).success).toBe(
      false,
    );
    expect(archiveLibraryDocumentSchema.safeParse({ motivo: "" }).success).toBe(
      false,
    );
    expect(listLibrarySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it("keeps visibility and text search predicates together for ordinary users", async () => {
    const { service, db } = make();
    await service.list(actor({ rol: RolUsuario.PRESTADOR }), {
      page: 1,
      pageSize: 20,
      q: "manual",
    });
    const where = db.documentoBiblioteca.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { alcance: AlcanceBiblioteca.GLOBAL },
        { alcance: AlcanceBiblioteca.AREA, sedeId: 20, areaId: 10 },
      ]),
    );
    expect(where.AND[0].OR).not.toContainEqual({
      alcance: AlcanceBiblioteca.AREA,
      sedeId: 20,
    });
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { titulo: { contains: "manual" } },
        { descripcion: { contains: "manual" } },
      ]),
    );
    expect(where.estado).toBe(EstadoBiblioteca.PUBLICADO);
    expect(where.versiones.some.estado).toBe(EstadoBiblioteca.PUBLICADO);
  });

  it("allows workflow users to filter draft state within their visibility", async () => {
    const { service, db } = make();
    await service.list(actor(), {
      page: 1,
      pageSize: 20,
      estado: "BORRADOR",
    });
    expect(db.documentoBiblioteca.findMany.mock.calls[0][0].where.estado).toBe(
      "BORRADOR",
    );
  });

  it("creates an immutable first version under a locked available owner file", async () => {
    const { service, db, audit } = make();
    const result = await service.create(actor(), createInput);
    expect(result.versiones).toHaveLength(1);
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(db.documentoBiblioteca.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alcance: AlcanceBiblioteca.AREA,
          creadoPorId: 7,
          versiones: {
            create: expect.objectContaining({
              numero: 1,
              archivoId: fileId,
              autorId: 7,
            }),
          },
        }),
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LIBRARY_DOCUMENT_CREATED" }),
      expect.anything(),
    );
  });

  it("reserves global documents for administrators", async () => {
    const { service } = make();
    await expect(
      service.create(actor({ rol: RolUsuario.JEFE_COORDINADORES }), {
        ...createInput,
        alcance: "GLOBAL",
        sedeId: undefined,
        areaId: undefined,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.create(actor({ rol: RolUsuario.ADMIN }), {
        ...createInput,
        alcance: "GLOBAL",
        sedeId: undefined,
        areaId: undefined,
      }),
    ).resolves.toBeDefined();
  });

  it("requires a project leader for a project-scoped draft", async () => {
    const { service } = make({
      db: {
        miembroProyectoKairos: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    });
    await expect(
      service.create(actor(), {
        ...createInput,
        alcance: "PROYECTO",
        sedeId: undefined,
        areaId: undefined,
        proyectoId: projectId,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects unavailable, reused, disallowed and oversized files", async () => {
    const unavailable = make({
      db: { archivo: { findFirst: vi.fn().mockResolvedValue(null) } },
    });
    await expect(
      unavailable.service.create(actor(), createInput),
    ).rejects.toMatchObject({
      status: 404,
    });
    const reused = make({
      db: {
        versionBiblioteca: {
          findFirst: vi.fn().mockResolvedValue({ id: versionId }),
        },
      },
    });
    await expect(
      reused.service.create(actor(), createInput),
    ).rejects.toMatchObject({
      status: 409,
    });
    const disallowed = make({
      db: {
        archivo: {
          findFirst: vi.fn().mockResolvedValue({
            id: fileId,
            extension: "txt",
            detectedMime: "text/plain",
            sizeBytes: 100,
          }),
        },
      },
    });
    await expect(
      disallowed.service.create(actor(), createInput),
    ).rejects.toMatchObject({
      status: 400,
    });
    const oversized = make({
      db: {
        archivo: {
          findFirst: vi.fn().mockResolvedValue({
            id: fileId,
            extension: "pdf",
            detectedMime: "application/pdf",
            sizeBytes: BigInt(26 * 1024 * 1024),
          }),
        },
      },
    });
    await expect(
      oversized.service.create(actor(), createInput),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it("serializes version numbers and prevents parallel open drafts", async () => {
    const blocked = make({
      db: {
        versionBiblioteca: {
          findFirst: vi.fn().mockResolvedValue({ id: versionId }),
        },
      },
    });
    await expect(
      blocked.service.createVersion(actor(), documentId, {
        archivoId: fileId,
        resumenCambios: "v2",
      }),
    ).rejects.toMatchObject({ status: 409 });

    const { service, db } = make();
    await service.createVersion(actor(), documentId, {
      archivoId: fileId,
      resumenCambios: "v2",
    });
    expect(db.versionBiblioteca.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ numero: 2 }) }),
    );
  });

  it("submits only drafts and preserves an already published document", async () => {
    const { service, db, audit } = make({
      db: { versionBiblioteca: { count: vi.fn().mockResolvedValue(1) } },
    });
    await service.submitReview(actor(), versionId);
    expect(db.versionBiblioteca.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: EstadoBiblioteca.EN_REVISION }),
      }),
    );
    expect(db.documentoBiblioteca.update).not.toHaveBeenCalled();
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LIBRARY_VERSION_SUBMITTED" }),
      expect.anything(),
    );
  });

  it("enforces independent review and returns requested changes to draft", async () => {
    const inReview = { ...version, estado: EstadoBiblioteca.EN_REVISION };
    const sameAuthor = make({
      db: {
        versionBiblioteca: { findUnique: vi.fn().mockResolvedValue(inReview) },
      },
    });
    await expect(
      sameAuthor.service.review(
        actor({ rol: RolUsuario.JEFE_AREA }),
        versionId,
        { decision: "APPROVE" },
      ),
    ).rejects.toMatchObject({ status: 409 });

    const { service, db, audit } = make({
      db: {
        versionBiblioteca: {
          findUnique: vi.fn().mockResolvedValue({ ...inReview, autorId: 99 }),
        },
      },
    });
    await service.review(actor({ rol: RolUsuario.JEFE_AREA }), versionId, {
      decision: "REQUEST_CHANGES",
      retroalimentacion: "Corrige el anexo",
    });
    expect(db.versionBiblioteca.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: EstadoBiblioteca.BORRADOR }),
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LIBRARY_VERSION_CHANGES_REQUESTED" }),
      expect.anything(),
    );
  });

  it("publishes an independently reviewed version and notifies its audience", async () => {
    const approved = {
      ...version,
      autorId: 99,
      estado: EstadoBiblioteca.EN_REVISION,
      revisadoPorId: 8,
      reviewedAt: new Date(),
    };
    const { service, db, audit } = make({
      db: {
        versionBiblioteca: { findUnique: vi.fn().mockResolvedValue(approved) },
      },
    });
    await service.publish(actor({ rol: RolUsuario.JEFE_AREA }), versionId, {});
    expect(db.versionBiblioteca.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoBiblioteca.PUBLICADO,
          publicadoPorId: 7,
        }),
      }),
    );
    expect(db.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            type: "LIBRARY_PUBLISHED",
            payload: expect.objectContaining({ requiresAcknowledgement: true }),
          }),
        ]),
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LIBRARY_VERSION_PUBLISHED" }),
      expect.anything(),
    );
  });

  it("requires a reason and archives the prior publication when substituting", async () => {
    const approved = {
      ...version,
      autorId: 99,
      estado: EstadoBiblioteca.EN_REVISION,
      revisadoPorId: 8,
      reviewedAt: new Date(),
    };
    const previous = {
      ...version,
      id: previousVersionId,
      estado: EstadoBiblioteca.PUBLICADO,
    };
    const { service, db } = make({
      db: {
        versionBiblioteca: {
          findUnique: vi.fn().mockResolvedValue(approved),
          findFirst: vi.fn().mockResolvedValue(previous),
        },
      },
    });
    await expect(
      service.publish(actor({ rol: RolUsuario.JEFE_AREA }), versionId, {}),
    ).rejects.toMatchObject({ status: 400 });
    await service.publish(actor({ rol: RolUsuario.JEFE_AREA }), versionId, {
      motivoSustitucion: "Nueva política",
    });
    expect(db.versionBiblioteca.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: previousVersionId },
        data: expect.objectContaining({
          estado: EstadoBiblioteca.ARCHIVADO,
          vigenteHasta: expect.any(Date),
        }),
      }),
    );
  });

  it("does not publish a version before its effective window", async () => {
    const approved = {
      ...version,
      autorId: 99,
      estado: EstadoBiblioteca.EN_REVISION,
      revisadoPorId: 8,
      reviewedAt: new Date(),
      vigenteDesde: new Date("2099-01-01T00:00:00Z"),
    };
    const { service } = make({
      db: {
        versionBiblioteca: { findUnique: vi.fn().mockResolvedValue(approved) },
      },
    });
    await expect(
      service.publish(actor({ rol: RolUsuario.JEFE_AREA }), versionId, {}),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("archives the document and every open or published version with a reason", async () => {
    const { service, db, audit } = make();
    await service.archive(
      actor({ rol: RolUsuario.JEFE_AREA }),
      documentId,
      "Documento retirado",
    );
    expect(db.versionBiblioteca.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: EstadoBiblioteca.ARCHIVADO }),
      }),
    );
    expect(db.documentoBiblioteca.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ motivoArchivo: "Documento retirado" }),
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LIBRARY_DOCUMENT_ARCHIVED" }),
      expect.anything(),
    );
  });

  it("authorizes published downloads with a resource-bound private capability", async () => {
    const published = {
      ...version,
      estado: EstadoBiblioteca.PUBLICADO,
      publishedAt: new Date(),
    };
    const { service, storage, audit } = make({
      db: {
        versionBiblioteca: { findUnique: vi.fn().mockResolvedValue(published) },
      },
    });
    await service.download(actor({ rol: RolUsuario.PRESTADOR }), versionId);
    expect(storage.downloadUrl).toHaveBeenCalledWith(
      fileId,
      expect.objectContaining({
        subjectId: "7",
        resourceId: fileId,
        purpose: "download",
      }),
      "7",
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LIBRARY_VERSION_DOWNLOADED" }),
    );
  });

  it("denies expired publication downloads to ordinary readers", async () => {
    const expired = {
      ...version,
      autorId: 99,
      estado: EstadoBiblioteca.PUBLICADO,
      vigenteHasta: new Date("2025-01-01T00:00:00Z"),
    };
    const { service } = make({
      db: {
        versionBiblioteca: { findUnique: vi.fn().mockResolvedValue(expired) },
      },
    });
    await expect(
      service.download(actor({ rol: RolUsuario.PRESTADOR }), versionId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("records acknowledgement once per user/version without implying legal acceptance", async () => {
    const published = {
      ...version,
      estado: EstadoBiblioteca.PUBLICADO,
      documento: { ...document, estado: EstadoBiblioteca.PUBLICADO },
    };
    const { service, db, audit } = make({
      db: {
        versionBiblioteca: { findUnique: vi.fn().mockResolvedValue(published) },
      },
    });
    const first = await service.acknowledge(
      actor({ rol: RolUsuario.PRESTADOR }),
      versionId,
    );
    expect(first.usuarioId).toBe(7);
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LIBRARY_VERSION_ACKNOWLEDGED",
        metadata: { legalAcceptance: false },
      }),
      expect.anything(),
    );
    db.acuseBiblioteca.findUnique.mockResolvedValue(first);
    await service.acknowledge(actor({ rol: RolUsuario.PRESTADOR }), versionId);
    expect(db.acuseBiblioteca.create).toHaveBeenCalledTimes(1);
    expect(audit.append).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed document and version identifiers", async () => {
    const { service } = make();
    await expect(service.detail(actor(), "not-an-id")).rejects.toMatchObject({
      status: 400,
    });
    await expect(service.download(actor(), "bad")).rejects.toMatchObject({
      status: 400,
    });
  });
});
