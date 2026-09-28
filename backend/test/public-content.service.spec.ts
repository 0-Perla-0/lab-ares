import { describe, expect, it, vi } from "vitest";
import {
  EstadoArchivo,
  EstadoContenidoPublico,
  EstadoUsuario,
  RolUsuario,
} from "../src/generated/prisma/enums";
import type { AuthUser } from "../src/auth/auth-user";
import {
  createPublicPageSchema,
  createPublicVersionSchema,
} from "../src/public-content/public-content.schemas";
import { PublicContentService } from "../src/public-content/public-content.service";

const pageId = "c12345678901234567890123";
const versionId = "c22345678901234567890123";
const assetId = "c32345678901234567890123";
const fileId = "c42345678901234567890123";

const actor = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 7,
  codigo: "COORD-7",
  email: "coord@example.com",
  rol: RolUsuario.COORDINADOR,
  estado: EstadoUsuario.ACTIVA,
  sedeId: 2,
  areaId: 3,
  turnoId: null,
  ...overrides,
});

const textBlock = {
  orden: 0,
  tipo: "TEXTO" as const,
  contenido: { texto: "Contenido institucional" },
};

const versionInput = {
  titulo: "Inicio",
  resumenCambios: "Publicación inicial",
  seoTitulo: "Ares",
  seoDescripcion: "Servicio Social Ares",
  bloques: [textBlock],
};

function make(overrides: Record<string, any> = {}) {
  const db: any = {
    paginaPublica: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({
        id: pageId,
        slug: "inicio",
        titulo: "Inicio",
        versiones: [{ id: versionId, numero: 1, bloques: [textBlock] }],
      }),
      update: vi.fn().mockResolvedValue({ id: pageId }),
    },
    versionContenidoPublico: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _max: { numero: 1 } }),
      create: vi.fn().mockResolvedValue({
        id: versionId,
        paginaId: pageId,
        numero: 2,
        bloques: [textBlock],
      }),
      update: vi.fn().mockResolvedValue({ id: versionId }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    bloqueContenidoPublico: { count: vi.fn().mockResolvedValue(0) },
    activoPublico: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    archivo: { findUnique: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  for (const [model, methods] of Object.entries(overrides.db ?? {}))
    db[model] = { ...db[model], ...(methods as object) };
  db.$transaction =
    overrides.db?.$transaction ??
    vi.fn((value: any) =>
      Array.isArray(value) ? Promise.all(value) : value(db),
    );
  const storage = {
    copy: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    signedPublic: vi.fn().mockResolvedValue("https://storage/public-signed"),
    ...(overrides.storage ?? {}),
  };
  const audit = { append: vi.fn().mockResolvedValue(undefined) };
  return {
    service: new PublicContentService(db, storage as any, audit as any),
    db,
    storage,
    audit,
  };
}

describe("public content contracts", () => {
  it("accepts only approved pages and controlled plain-text blocks", () => {
    expect(
      createPublicPageSchema.parse({ slug: "inicio", ...versionInput }),
    ).toMatchObject({ slug: "inicio" });
    expect(() =>
      createPublicPageSchema.parse({ slug: "directorio", ...versionInput }),
    ).toThrow();
    expect(() =>
      createPublicVersionSchema.parse({
        ...versionInput,
        bloques: [
          { ...textBlock, contenido: { texto: "<script>alert(1)</script>" } },
        ],
      }),
    ).toThrow();
    expect(() =>
      createPublicVersionSchema.parse({
        ...versionInput,
        bloques: [
          {
            orden: 0,
            tipo: "ENLACE",
            contenido: { etiqueta: "Inseguro", url: "http://example.com" },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      createPublicVersionSchema.parse({
        ...versionInput,
        bloques: [
          textBlock,
          {
            orden: 0,
            tipo: "ENLACE",
            contenido: { etiqueta: "X", url: "javascript:alert(1)" },
          },
        ],
      }),
    ).toThrow();
  });

  it("supports every approved block without arbitrary properties", () => {
    const blocks = [
      textBlock,
      {
        orden: 1,
        tipo: "ENCABEZADO",
        contenido: { texto: "Título", nivel: 2 },
      },
      {
        orden: 2,
        tipo: "LISTA",
        contenido: { elementos: ["Uno"], ordenada: false },
      },
      {
        orden: 3,
        tipo: "ENLACE",
        contenido: { etiqueta: "Portal", url: "/login" },
      },
      {
        orden: 4,
        tipo: "AVISO",
        contenido: { texto: "Aviso", tono: "INFORMATIVO" },
      },
      {
        orden: 5,
        tipo: "IMAGEN",
        activoPublicoId: assetId,
        contenido: { alt: "Equipo Ares" },
      },
      {
        orden: 6,
        tipo: "FAQ",
        contenido: { pregunta: "¿Cómo?", respuesta: "Con invitación." },
      },
    ];
    expect(
      createPublicVersionSchema.parse({ ...versionInput, bloques: blocks }).bloques,
    ).toHaveLength(7);
    expect(() =>
      createPublicVersionSchema.parse({
        ...versionInput,
        bloques: [{ ...textBlock, html: "<b>x</b>" }],
      }),
    ).toThrow();
  });

  it("returns only the current publication and stable public asset routes", async () => {
    const published = {
      id: versionId,
      numero: 2,
      estado: EstadoContenidoPublico.PUBLICADO,
      titulo: "Inicio",
      resumenCambios: "Actualización",
      seoTitulo: "Ares",
      seoDescripcion: null,
      publishedAt: new Date(),
      bloques: [
        {
          id: "b1",
          orden: 0,
          tipo: "IMAGEN",
          contenido: { alt: "Ares" },
          activoPublico: { id: assetId, activo: true, mime: "image/png" },
        },
      ],
    };
    const { service, db } = make({
      db: {
        paginaPublica: {
          findUnique: vi.fn().mockResolvedValue({
            slug: "inicio",
            estado: EstadoContenidoPublico.PUBLICADO,
            versiones: [published],
          }),
        },
      },
    });
    const result = await service.publishedPage("inicio");
    expect(result.bloques[0]).toMatchObject({
      activo: { id: assetId, url: `/api/public-content/assets/${assetId}` },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /objectKey|archivoOrigen|autorId|publicadoPorId/,
    );
    expect(db.paginaPublica.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "inicio" } }),
    );
  });

  it("returns only FAQ blocks from the approved FAQ page", async () => {
    const { service } = make();
    vi.spyOn(service, "publishedPage").mockResolvedValue({
      slug: "preguntas-frecuentes",
      titulo: "FAQ",
      estado: EstadoContenidoPublico.PUBLICADO,
      metadata: {} as any,
      bloques: [
        { tipo: "TEXTO", contenido: { texto: "Intro" } },
        { tipo: "FAQ", contenido: { pregunta: "Q", respuesta: "A" } },
      ],
    } as any);
    const result = await service.faq();
    expect(result.bloques).toEqual([
      { tipo: "FAQ", contenido: { pregunta: "Q", respuesta: "A" } },
    ]);
  });

  it("creates page version 1 and audits the immutable draft", async () => {
    const { service, db, audit } = make();
    const result = await service.createPage(actor(), {
      slug: "inicio",
      ...versionInput,
    });
    expect(result.versiones[0].numero).toBe(1);
    expect(db.paginaPublica.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: "inicio",
          versiones: { create: expect.objectContaining({ numero: 1 }) },
        }),
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PUBLIC_PAGE_CREATED" }),
      expect.anything(),
    );
  });

  it("locks the page and assigns the next immutable version number", async () => {
    const { service, db } = make({
      db: {
        paginaPublica: {
          findUnique: vi.fn().mockResolvedValue({
            id: pageId,
            estado: EstadoContenidoPublico.PUBLICADO,
          }),
        },
      },
    });
    const result = await service.createVersion(actor(), pageId, versionInput);
    expect(result.numero).toBe(2);
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(db.versionContenidoPublico.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ numero: 2 }) }),
    );
  });

  it("allows only global administrators to publish and archives the previous version atomically", async () => {
    const draft = {
      id: versionId,
      paginaId: pageId,
      numero: 2,
      autorId: 7,
      titulo: "Inicio renovado",
      estado: EstadoContenidoPublico.BORRADOR,
      pagina: {
        id: pageId,
        slug: "inicio",
        estado: EstadoContenidoPublico.PUBLICADO,
      },
      bloques: [textBlock],
    };
    const { service, db, audit } = make({
      db: {
        versionContenidoPublico: {
          findUnique: vi.fn().mockResolvedValue(draft),
          update: vi.fn().mockResolvedValue({
            ...draft,
            estado: EstadoContenidoPublico.PUBLICADO,
          }),
        },
      },
    });
    await expect(service.publish(actor(), versionId)).rejects.toThrow();
    await service.publish(actor({ rol: RolUsuario.ADMIN }), versionId);
    expect(db.versionContenidoPublico.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoContenidoPublico.ARCHIVADO,
        }),
      }),
    );
    expect(db.paginaPublica.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ titulo: "Inicio renovado" }),
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PUBLIC_CONTENT_PUBLISHED" }),
      expect.anything(),
    );
  });

  it("copies a scanned owned image into a different public object key", async () => {
    const file = {
      id: fileId,
      propietarioId: 7,
      status: EstadoArchivo.DISPONIBLE,
      detectedMime: "image/png",
      originalName: "equipo ares.png",
      objectKey: "private/scanned.png",
      sizeBytes: BigInt(25),
    };
    const { service, db, storage, audit } = make({
      db: {
        archivo: { findUnique: vi.fn().mockResolvedValue(file) },
        activoPublico: {
          create: vi
            .fn()
            .mockImplementation(({ data }) => ({ id: assetId, ...data })),
        },
      },
    });
    await expect(
      service.classifyAsset(actor(), { archivoId: fileId }),
    ).rejects.toThrow();
    const result = await service.classifyAsset(
      actor({ rol: RolUsuario.ADMIN }),
      { archivoId: fileId },
    );
    expect(result.sizeBytes).toBe("25");
    expect(storage.copy).toHaveBeenCalledWith(
      "available",
      "public",
      file.objectKey,
      expect.stringMatching(/^public\//),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PUBLIC_ASSET_CLASSIFIED" }),
      expect.anything(),
    );
  });

  it.each([
    [
      "foreign",
      {
        propietarioId: 99,
        status: EstadoArchivo.DISPONIBLE,
        detectedMime: "image/png",
      },
    ],
    [
      "unscanned",
      {
        propietarioId: 7,
        status: EstadoArchivo.RECHAZADO,
        detectedMime: "image/png",
      },
    ],
    [
      "non-image",
      {
        propietarioId: 7,
        status: EstadoArchivo.DISPONIBLE,
        detectedMime: "application/pdf",
      },
    ],
  ])(
    "rejects %s private source from public classification",
    async (_label, partial) => {
      const { service, storage } = make({
        db: {
          archivo: {
            findUnique: vi.fn().mockResolvedValue({
              id: fileId,
              originalName: "file.png",
              objectKey: "private/file",
              sizeBytes: BigInt(1),
              ...partial,
            }),
          },
        },
      });
      await expect(
      service.classifyAsset(actor({ rol: RolUsuario.ADMIN }), {
        archivoId: fileId,
      }),
      ).rejects.toThrow();
      expect(storage.copy).not.toHaveBeenCalled();
    },
  );

  it("serves only active classified assets through a short-lived public URL", async () => {
    const { service, storage } = make({
      db: {
        activoPublico: {
          findFirst: vi.fn().mockResolvedValue({
            id: assetId,
            objectKey: "public/image.png",
            mime: "image/png",
          }),
        },
      },
    });
    const result = await service.publicAsset(assetId);
    expect(result).toMatchObject({ id: assetId, expiresIn: 900 });
    expect(storage.signedPublic).toHaveBeenCalledWith(
      "public/image.png",
      900,
      "image/png",
    );
  });

  it("cannot withdraw a public asset referenced by a published page", async () => {
    const { service } = make({
      db: {
        activoPublico: {
          findUnique: vi.fn().mockResolvedValue({ id: assetId, activo: true }),
        },
        bloqueContenidoPublico: { count: vi.fn().mockResolvedValue(1) },
      },
    });
    await expect(
      service.archiveAsset(
        actor({ rol: RolUsuario.ADMIN }),
        assetId,
        "Retiro autorizado",
      ),
    ).rejects.toThrow("PUBLIC_ASSET_IN_USE");
  });

  it("archives a public page and every open/public version with a reason", async () => {
    const { service, db, audit } = make({
      db: {
        paginaPublica: {
          findUnique: vi.fn().mockResolvedValue({
            id: pageId,
            slug: "inicio",
            estado: EstadoContenidoPublico.PUBLICADO,
          }),
        },
      },
    });
    await service.archivePage(
      actor({ rol: RolUsuario.ADMIN }),
      pageId,
      "Contenido retirado",
    );
    expect(db.versionContenidoPublico.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoContenidoPublico.ARCHIVADO,
        }),
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PUBLIC_PAGE_ARCHIVED",
        metadata: expect.objectContaining({ reason: "Contenido retirado" }),
      }),
      expect.anything(),
    );
  });
});
