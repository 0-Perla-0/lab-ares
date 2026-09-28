import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuditService } from "../auth/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { getAccessScope, Permission } from "../auth/permissions";
import { PrismaService } from "../database/prisma.service";
import {
  EstadoArchivo,
  EstadoContenidoPublico,
  EstadoUsuario,
  RolUsuario,
} from "../generated/prisma/enums";
import { S3Storage } from "../storage/s3.storage";
import {
  PUBLIC_PAGE_SLUGS,
  type ClassifyPublicAssetInput,
  type CreatePublicPageInput,
  type CreatePublicVersionInput,
  type ListPublicPagesInput,
  type PublicContentBlockInput,
} from "./public-content.schemas";

const CUID = /^c[a-z0-9]{20,30}$/;
const PUBLIC_IMAGE_MIMES = new Set(["image/jpeg", "image/png"]);

@Injectable()
export class PublicContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3Storage,
    private readonly audit: AuditService,
  ) {}

  private require(actor: AuthUser, permission: Permission) {
    if (
      actor.estado !== EstadoUsuario.ACTIVA ||
      !getAccessScope(actor, permission)
    )
      throw new ForbiddenException();
  }

  private requireAdmin(actor: AuthUser, permission: Permission) {
    this.require(actor, permission);
    if (actor.rol !== RolUsuario.ADMIN) throw new ForbiddenException();
  }

  private id(value: string) {
    if (!CUID.test(value))
      throw new BadRequestException("INVALID_PUBLIC_CONTENT_ID");
  }

  private slug(value: string) {
    if (!(PUBLIC_PAGE_SLUGS as readonly string[]).includes(value))
      throw new NotFoundException("PUBLIC_PAGE_NOT_FOUND");
    return value;
  }

  private blockData(block: PublicContentBlockInput) {
    return {
      orden: block.orden,
      tipo: block.tipo,
      contenido: block.contenido,
      activoPublicoId: block.tipo === "IMAGEN" ? block.activoPublicoId : null,
    };
  }

  private async assertAssets(
    blocks: PublicContentBlockInput[],
    client: any = this.prisma,
  ) {
    const ids = [
      ...new Set(
        blocks.flatMap((block) =>
          block.tipo === "IMAGEN" ? [block.activoPublicoId] : [],
        ),
      ),
    ];
    if (!ids.length) return;
    const assets = await client.activoPublico.findMany({
      where: { id: { in: ids }, activo: true },
      select: { id: true },
    });
    if (assets.length !== ids.length)
      throw new BadRequestException("PUBLIC_ASSET_NOT_AVAILABLE");
  }

  private safePublicPage(page: any) {
    const version = page.versiones[0];
    if (!version) throw new NotFoundException("PUBLIC_PAGE_NOT_FOUND");
    return {
      slug: page.slug,
      titulo: version.titulo,
      estado: EstadoContenidoPublico.PUBLICADO,
      metadata: {
        version: version.numero,
        resumenCambios: version.resumenCambios,
        publishedAt: version.publishedAt,
        seoTitulo: version.seoTitulo,
        seoDescripcion: version.seoDescripcion,
      },
      bloques: version.bloques.map((block: any) => ({
        id: block.id,
        orden: block.orden,
        tipo: block.tipo,
        contenido: block.contenido,
        ...(block.tipo === "IMAGEN"
          ? {
              activo: {
                id: block.activoPublico.id,
                url: `/api/public-content/assets/${block.activoPublico.id}`,
                mime: block.activoPublico.mime,
              },
            }
          : {}),
      })),
    };
  }

  async publishedPage(slug: string) {
    const page = await this.prisma.paginaPublica.findUnique({
      where: { slug: this.slug(slug) },
      include: {
        versiones: {
          where: { estado: EstadoContenidoPublico.PUBLICADO },
          orderBy: { numero: "desc" },
          take: 1,
          include: {
            bloques: {
              orderBy: { orden: "asc" },
              include: {
                activoPublico: {
                  select: { id: true, activo: true, mime: true },
                },
              },
            },
          },
        },
      },
    });
    if (!page || page.estado !== EstadoContenidoPublico.PUBLICADO)
      throw new NotFoundException("PUBLIC_PAGE_NOT_FOUND");
    const version = page.versiones[0];
    if (
      !version ||
      version.bloques.some(
        (block: any) => block.tipo === "IMAGEN" && !block.activoPublico?.activo,
      )
    )
      throw new NotFoundException("PUBLIC_PAGE_NOT_FOUND");
    return this.safePublicPage(page);
  }

  async faq() {
    const page = await this.publishedPage("preguntas-frecuentes");
    return {
      ...page,
      bloques: page.bloques.filter((block: any) => block.tipo === "FAQ"),
    };
  }

  async publicAsset(id: string) {
    this.id(id);
    const asset = await this.prisma.activoPublico.findFirst({
      where: { id, activo: true },
      select: { id: true, objectKey: true, mime: true },
    });
    if (!asset) throw new NotFoundException("PUBLIC_ASSET_NOT_FOUND");
    return {
      id: asset.id,
      url: await this.storage.signedPublic(asset.objectKey, 900, asset.mime),
      expiresIn: 900,
      mime: asset.mime,
    };
  }

  async listAdmin(actor: AuthUser, input: ListPublicPagesInput) {
    this.require(actor, Permission.PUBLIC_CONTENT_DRAFT);
    const where = input.estado ? { estado: input.estado } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.paginaPublica.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          versiones: {
            orderBy: { numero: "desc" },
            take: 1,
            select: {
              id: true,
              numero: true,
              estado: true,
              titulo: true,
              resumenCambios: true,
              publishedAt: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.paginaPublica.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async detailAdmin(actor: AuthUser, id: string) {
    this.require(actor, Permission.PUBLIC_CONTENT_DRAFT);
    this.id(id);
    const page = await this.prisma.paginaPublica.findUnique({
      where: { id },
      include: {
        versiones: {
          orderBy: { numero: "desc" },
          include: {
            bloques: {
              orderBy: { orden: "asc" },
              include: {
                activoPublico: {
                  select: { id: true, activo: true, mime: true, nombre: true },
                },
              },
            },
          },
        },
      },
    });
    if (!page) throw new NotFoundException("PUBLIC_PAGE_NOT_FOUND");
    return page;
  }

  async createPage(actor: AuthUser, input: CreatePublicPageInput) {
    this.require(actor, Permission.PUBLIC_CONTENT_DRAFT);
    await this.assertAssets(input.bloques);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const page = await tx.paginaPublica.create({
          data: {
            slug: input.slug,
            titulo: input.titulo,
            creadoPorId: actor.id,
            versiones: {
              create: {
                numero: 1,
                autorId: actor.id,
                titulo: input.titulo,
                resumenCambios: input.resumenCambios,
                seoTitulo: input.seoTitulo,
                seoDescripcion: input.seoDescripcion,
                bloques: {
                  create: input.bloques.map((b) => this.blockData(b)),
                },
              },
            },
          },
          include: { versiones: { include: { bloques: true } } },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: actor.id,
            action: "PUBLIC_PAGE_CREATED",
            resource: "public_page",
            correlationId: page.id,
            metadata: { slug: page.slug, version: 1 },
          },
          tx,
        );
        return page;
      });
    } catch (error: any) {
      if (error?.code === "P2002")
        throw new ConflictException("PUBLIC_PAGE_ALREADY_EXISTS");
      throw error;
    }
  }

  async createVersion(
    actor: AuthUser,
    pageId: string,
    input: CreatePublicVersionInput,
  ) {
    this.require(actor, Permission.PUBLIC_CONTENT_DRAFT);
    this.id(pageId);
    await this.assertAssets(input.bloques);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM PaginaPublica WHERE id = ${pageId} FOR UPDATE`;
      const page = await tx.paginaPublica.findUnique({ where: { id: pageId } });
      if (!page) throw new NotFoundException("PUBLIC_PAGE_NOT_FOUND");
      if (page.estado === EstadoContenidoPublico.ARCHIVADO)
        throw new ConflictException("PUBLIC_PAGE_ARCHIVED");
      const open = await tx.versionContenidoPublico.findFirst({
        where: { paginaId: pageId, estado: EstadoContenidoPublico.BORRADOR },
        select: { id: true },
      });
      if (open) throw new ConflictException("PUBLIC_DRAFT_ALREADY_EXISTS");
      const latest = await tx.versionContenidoPublico.aggregate({
        where: { paginaId: pageId },
        _max: { numero: true },
      });
      const version = await tx.versionContenidoPublico.create({
        data: {
          paginaId: pageId,
          numero: (latest._max.numero ?? 0) + 1,
          autorId: actor.id,
          titulo: input.titulo,
          resumenCambios: input.resumenCambios,
          seoTitulo: input.seoTitulo,
          seoDescripcion: input.seoDescripcion,
          bloques: { create: input.bloques.map((b) => this.blockData(b)) },
        },
        include: { bloques: true },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: actor.id,
          action: "PUBLIC_CONTENT_VERSION_CREATED",
          resource: "public_content_version",
          correlationId: version.id,
          metadata: { pageId, version: version.numero },
        },
        tx,
      );
      return version;
    });
  }

  async publish(actor: AuthUser, versionId: string) {
    this.requireAdmin(actor, Permission.PUBLIC_CONTENT_PUBLISH);
    this.id(versionId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM VersionContenidoPublico WHERE id = ${versionId} FOR UPDATE`;
      const version = await tx.versionContenidoPublico.findUnique({
        where: { id: versionId },
        include: { pagina: true, bloques: true },
      });
      if (!version)
        throw new NotFoundException("PUBLIC_CONTENT_VERSION_NOT_FOUND");
      if (
        version.estado !== EstadoContenidoPublico.BORRADOR ||
        version.pagina.estado === EstadoContenidoPublico.ARCHIVADO
      )
        throw new ConflictException("PUBLIC_CONTENT_NOT_PUBLISHABLE");
      await this.assertAssets(version.bloques as any, tx);
      const now = new Date();
      await tx.versionContenidoPublico.updateMany({
        where: {
          paginaId: version.paginaId,
          estado: EstadoContenidoPublico.PUBLICADO,
        },
        data: { estado: EstadoContenidoPublico.ARCHIVADO, archivedAt: now },
      });
      const published = await tx.versionContenidoPublico.update({
        where: { id: version.id },
        data: {
          estado: EstadoContenidoPublico.PUBLICADO,
          publicadoPorId: actor.id,
          publishedAt: now,
          archivedAt: null,
        },
        include: { bloques: true },
      });
      await tx.paginaPublica.update({
        where: { id: version.paginaId },
        data: {
          titulo: version.titulo,
          estado: EstadoContenidoPublico.PUBLICADO,
          archivadoPorId: null,
          motivoArchivo: null,
          archivadoAt: null,
        },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: version.autorId,
          action: "PUBLIC_CONTENT_PUBLISHED",
          resource: "public_content_version",
          correlationId: version.id,
          metadata: {
            pageId: version.paginaId,
            slug: version.pagina.slug,
            version: version.numero,
          },
        },
        tx,
      );
      return published;
    });
  }

  async archivePage(actor: AuthUser, pageId: string, motivo: string) {
    this.requireAdmin(actor, Permission.PUBLIC_CONTENT_ARCHIVE);
    this.id(pageId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM PaginaPublica WHERE id = ${pageId} FOR UPDATE`;
      const page = await tx.paginaPublica.findUnique({ where: { id: pageId } });
      if (!page) throw new NotFoundException("PUBLIC_PAGE_NOT_FOUND");
      if (page.estado === EstadoContenidoPublico.ARCHIVADO)
        throw new ConflictException("PUBLIC_PAGE_ALREADY_ARCHIVED");
      const now = new Date();
      await tx.versionContenidoPublico.updateMany({
        where: {
          paginaId: pageId,
          estado: {
            in: [
              EstadoContenidoPublico.BORRADOR,
              EstadoContenidoPublico.PUBLICADO,
            ],
          },
        },
        data: { estado: EstadoContenidoPublico.ARCHIVADO, archivedAt: now },
      });
      const archived = await tx.paginaPublica.update({
        where: { id: pageId },
        data: {
          estado: EstadoContenidoPublico.ARCHIVADO,
          archivadoPorId: actor.id,
          motivoArchivo: motivo,
          archivadoAt: now,
        },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: actor.id,
          action: "PUBLIC_PAGE_ARCHIVED",
          resource: "public_page",
          correlationId: pageId,
          metadata: { reason: motivo, slug: page.slug },
        },
        tx,
      );
      return archived;
    });
  }

  async classifyAsset(actor: AuthUser, input: ClassifyPublicAssetInput) {
    this.requireAdmin(actor, Permission.PUBLIC_CONTENT_PUBLISH);
    const existing = await this.prisma.activoPublico.findUnique({
      where: { archivoOrigenId: input.archivoId },
    });
    if (existing) {
      if (!existing.activo)
        throw new ConflictException("PUBLIC_ASSET_ARCHIVED");
      return { ...existing, sizeBytes: existing.sizeBytes.toString() };
    }
    const file = await this.prisma.archivo.findUnique({
      where: { id: input.archivoId },
    });
    if (
      !file ||
      file.propietarioId !== actor.id ||
      file.status !== EstadoArchivo.DISPONIBLE ||
      !file.detectedMime ||
      !PUBLIC_IMAGE_MIMES.has(file.detectedMime)
    )
      throw new BadRequestException("PUBLIC_ASSET_SOURCE_NOT_ALLOWED");
    const mime = file.detectedMime;
    const safeName = file.originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectKey = `public/${randomUUID()}-${safeName}`;
    await this.storage.copy("available", "public", file.objectKey, objectKey);
    try {
      const asset = await this.prisma.$transaction(async (tx) => {
        const created = await tx.activoPublico.create({
          data: {
            archivoOrigenId: file.id,
            objectKey,
            nombre: file.originalName,
            mime,
            sizeBytes: file.sizeBytes,
            publicadoPorId: actor.id,
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: actor.id,
            action: "PUBLIC_ASSET_CLASSIFIED",
            resource: "public_asset",
            correlationId: created.id,
            metadata: { sourceFileId: file.id, mime },
          },
          tx,
        );
        return created;
      });
      return { ...asset, sizeBytes: asset.sizeBytes.toString() };
    } catch (error) {
      await this.storage.delete("public", objectKey).catch(() => undefined);
      throw error;
    }
  }

  async archiveAsset(actor: AuthUser, assetId: string, motivo: string) {
    this.requireAdmin(actor, Permission.PUBLIC_CONTENT_ARCHIVE);
    this.id(assetId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM ActivoPublico WHERE id = ${assetId} FOR UPDATE`;
      const asset = await tx.activoPublico.findUnique({
        where: { id: assetId },
      });
      if (!asset || !asset.activo)
        throw new NotFoundException("PUBLIC_ASSET_NOT_FOUND");
      const publishedReferences = await tx.bloqueContenidoPublico.count({
        where: {
          activoPublicoId: assetId,
          version: { estado: EstadoContenidoPublico.PUBLICADO },
        },
      });
      if (publishedReferences)
        throw new ConflictException("PUBLIC_ASSET_IN_USE");
      const archived = await tx.activoPublico.update({
        where: { id: assetId },
        data: { activo: false, motivoArchivo: motivo, archivadoAt: new Date() },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: actor.id,
          action: "PUBLIC_ASSET_ARCHIVED",
          resource: "public_asset",
          correlationId: assetId,
          metadata: { reason: motivo },
        },
        tx,
      );
      return { ...archived, sizeBytes: archived.sizeBytes.toString() };
    });
  }
}
