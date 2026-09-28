import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "../auth/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import {
  AlcanceBiblioteca,
  EstadoArchivo,
  EstadoBiblioteca,
  EstadoUsuario,
  RolMiembroProyectoKairos,
  RolUsuario,
} from "../generated/prisma/enums";
import { StorageService } from "../storage/storage.service";
import { issueDownloadCapability } from "../storage/storage.types";
import type {
  CreateLibraryDocumentInput,
  CreateLibraryVersionInput,
  ListLibraryInput,
  PublishLibraryVersionInput,
  ReviewLibraryVersionInput,
} from "./library.schemas";

const CUID = /^c[a-z0-9]{20,30}$/;
const ALLOWED_FILES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

type ScopeTarget = {
  alcance: AlcanceBiblioteca;
  sedeId: number | null;
  areaId: number | null;
  proyectoId: string | null;
};

@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  private active(actor: AuthUser) {
    if (actor.estado !== EstadoUsuario.ACTIVA) throw new ForbiddenException();
  }

  private permission(actor: AuthUser, permission: Permission) {
    this.active(actor);
    const scope = getAccessScope(actor, permission);
    if (!scope) throw new ForbiddenException();
    return scope;
  }

  private id(value: string) {
    if (!CUID.test(value)) throw new BadRequestException("INVALID_LIBRARY_ID");
  }

  private visibility(actor: AuthUser) {
    const granted = this.permission(actor, Permission.LIBRARY_READ);
    if (granted === AccessScope.GLOBAL) return {};
    const or: Record<string, unknown>[] = [
      { alcance: AlcanceBiblioteca.GLOBAL },
    ];
    if (actor.sedeId != null) {
      or.push({ alcance: AlcanceBiblioteca.SEDE, sedeId: actor.sedeId });
      if (granted === AccessScope.SEDE)
        or.push({ alcance: AlcanceBiblioteca.AREA, sedeId: actor.sedeId });
    }
    if (actor.areaId != null)
      or.push({
        alcance: AlcanceBiblioteca.AREA,
        sedeId: actor.sedeId,
        areaId: actor.areaId,
      });
    or.push({
      alcance: AlcanceBiblioteca.PROYECTO,
      proyecto: {
        miembros: { some: { usuarioId: actor.id, removedAt: null } },
      },
    });
    return { AND: [{ OR: or }] };
  }

  private isWorkflowUser(actor: AuthUser) {
    return [
      Permission.LIBRARY_DRAFT_CREATE,
      Permission.LIBRARY_REVIEW,
      Permission.LIBRARY_PUBLISH,
      Permission.LIBRARY_ARCHIVE,
    ].some((permission) => getAccessScope(actor, permission) !== null);
  }

  private async assertTarget(
    actor: AuthUser,
    permission: Permission,
    target: ScopeTarget,
    client: any = this.prisma,
  ) {
    const granted = this.permission(actor, permission);
    if (target.alcance === AlcanceBiblioteca.GLOBAL) {
      if (actor.rol !== RolUsuario.ADMIN) throw new ForbiddenException();
      return;
    }
    if (target.alcance === AlcanceBiblioteca.SEDE) {
      const sede = await client.sede.findFirst({
        where: { id: target.sedeId, activa: true },
        select: { id: true },
      });
      if (
        !sede ||
        !(
          granted === AccessScope.GLOBAL ||
          (granted === AccessScope.SEDE && actor.sedeId === target.sedeId)
        )
      )
        throw new ForbiddenException();
      return;
    }
    if (target.alcance === AlcanceBiblioteca.AREA) {
      const area = await client.area.findFirst({
        where: { id: target.areaId, sedeId: target.sedeId, activa: true },
        select: { id: true, sedeId: true },
      });
      if (
        !area ||
        !(
          granted === AccessScope.GLOBAL ||
          (granted === AccessScope.SEDE && actor.sedeId === area.sedeId) ||
          (granted === AccessScope.AREA && actor.areaId === area.id)
        )
      )
        throw new ForbiddenException();
      return;
    }
    if (!target.proyectoId) throw new ForbiddenException();
    const project = await client.proyectoKairos.findUnique({
      where: { id: target.proyectoId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("LIBRARY_PROJECT_NOT_FOUND");
    if (granted === AccessScope.GLOBAL) return;
    const membership = await client.miembroProyectoKairos.findFirst({
      where: {
        proyectoId: target.proyectoId,
        usuarioId: actor.id,
        removedAt: null,
        rol: {
          in: [
            RolMiembroProyectoKairos.PROPIETARIO,
            RolMiembroProyectoKairos.SUBLIDER,
          ],
        },
      },
      select: { usuarioId: true },
    });
    if (!membership) throw new ForbiddenException();
  }

  private async file(
    actor: AuthUser,
    archivoId: string,
    client: any = this.prisma,
  ) {
    const file = await client.archivo.findFirst({
      where: {
        id: archivoId,
        propietarioId: actor.id,
        status: EstadoArchivo.DISPONIBLE,
      },
      select: {
        id: true,
        extension: true,
        detectedMime: true,
        sizeBytes: true,
      },
    });
    if (!file) throw new NotFoundException("LIBRARY_FILE_NOT_FOUND");
    const extension = String(file.extension ?? "").toLowerCase();
    if (
      !ALLOWED_FILES[extension] ||
      ALLOWED_FILES[extension] !== file.detectedMime
    )
      throw new BadRequestException("LIBRARY_FILE_TYPE_NOT_ALLOWED");
    if (BigInt(file.sizeBytes) > BigInt(this.config.get("LIBRARY_MAX_BYTES")))
      throw new BadRequestException("LIBRARY_FILE_TOO_LARGE");
    const used = await client.versionBiblioteca.findFirst({
      where: { archivoId },
      select: { id: true },
    });
    if (used) throw new ConflictException("LIBRARY_FILE_ALREADY_USED");
    return file;
  }

  private target(input: {
    alcance: AlcanceBiblioteca | string;
    sedeId?: number | null;
    areaId?: number | null;
    proyectoId?: string | null;
  }): ScopeTarget {
    return {
      alcance: input.alcance as AlcanceBiblioteca,
      sedeId: input.sedeId ?? null,
      areaId: input.areaId ?? null,
      proyectoId: input.proyectoId ?? null,
    };
  }

  private activeVersionWhere(now = new Date()) {
    return {
      estado: EstadoBiblioteca.PUBLICADO,
      AND: [
        { OR: [{ vigenteDesde: null }, { vigenteDesde: { lte: now } }] },
        { OR: [{ vigenteHasta: null }, { vigenteHasta: { gt: now } }] },
      ],
    };
  }

  async list(actor: AuthUser, input: ListLibraryInput) {
    const workflow = this.isWorkflowUser(actor);
    const now = new Date();
    const where: any = {
      ...this.visibility(actor),
      ...(input.q
        ? {
            OR: [
              { titulo: { contains: input.q } },
              { descripcion: { contains: input.q } },
            ],
          }
        : {}),
      ...(input.categoria ? { categoria: input.categoria } : {}),
      ...(input.alcance ? { alcance: input.alcance } : {}),
      ...(input.requiereAcuse
        ? { requiereAcuse: input.requiereAcuse === "true" }
        : {}),
    };
    if (workflow && input.estado) where.estado = input.estado;
    if (!workflow) {
      where.estado = EstadoBiblioteca.PUBLICADO;
      where.versiones = { some: this.activeVersionWhere(now) };
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.documentoBiblioteca.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          versiones: {
            where: workflow ? undefined : this.activeVersionWhere(now),
            orderBy: { numero: "desc" },
            take: 1,
            select: {
              id: true,
              numero: true,
              estado: true,
              resumenCambios: true,
              vigenteDesde: true,
              vigenteHasta: true,
              publishedAt: true,
            },
          },
        },
      }),
      this.prisma.documentoBiblioteca.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async detail(actor: AuthUser, id: string) {
    this.id(id);
    const workflow = this.isWorkflowUser(actor);
    const document = await this.prisma.documentoBiblioteca.findFirst({
      where: { id, ...this.visibility(actor) },
      include: {
        versiones: {
          where: workflow ? undefined : this.activeVersionWhere(),
          orderBy: { numero: "desc" },
          select: {
            id: true,
            numero: true,
            estado: true,
            resumenCambios: true,
            retroalimentacion: true,
            motivoSustitucion: true,
            vigenteDesde: true,
            vigenteHasta: true,
            submittedAt: true,
            reviewedAt: true,
            publishedAt: true,
            archivedAt: true,
            createdAt: true,
            autorId: true,
            revisadoPorId: true,
            publicadoPorId: true,
          },
        },
      },
    });
    if (
      !document ||
      (!workflow && document.estado !== EstadoBiblioteca.PUBLICADO)
    )
      throw new NotFoundException("LIBRARY_DOCUMENT_NOT_FOUND");
    return document;
  }

  async create(actor: AuthUser, input: CreateLibraryDocumentInput) {
    const target = this.target(input);
    await this.assertTarget(actor, Permission.LIBRARY_DRAFT_CREATE, target);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM Archivo WHERE id = ${input.archivoId} FOR UPDATE`;
      await this.file(actor, input.archivoId, tx);
      const document = await tx.documentoBiblioteca.create({
        data: {
          titulo: input.titulo,
          descripcion: input.descripcion,
          categoria: input.categoria,
          alcance: target.alcance,
          requiereAcuse: input.requiereAcuse,
          sedeId: target.sedeId,
          areaId: target.areaId,
          proyectoId: target.proyectoId,
          creadoPorId: actor.id,
          versiones: {
            create: {
              numero: 1,
              archivoId: input.archivoId,
              autorId: actor.id,
              resumenCambios: input.resumenCambios,
              vigenteDesde: input.vigenteDesde
                ? new Date(input.vigenteDesde)
                : null,
              vigenteHasta: input.vigenteHasta
                ? new Date(input.vigenteHasta)
                : null,
            },
          },
        },
        include: { versiones: true },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: actor.id,
          action: "LIBRARY_DOCUMENT_CREATED",
          resource: "library_document",
          correlationId: document.id,
          metadata: { alcance: target.alcance, categoria: input.categoria },
        },
        tx,
      );
      return document;
    });
  }

  async createVersion(
    actor: AuthUser,
    documentId: string,
    input: CreateLibraryVersionInput,
  ) {
    this.id(documentId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM DocumentoBiblioteca WHERE id = ${documentId} FOR UPDATE`;
      const document = await tx.documentoBiblioteca.findUnique({
        where: { id: documentId },
      });
      if (!document) throw new NotFoundException("LIBRARY_DOCUMENT_NOT_FOUND");
      await this.assertTarget(
        actor,
        Permission.LIBRARY_DRAFT_CREATE,
        this.target(document),
        tx,
      );
      if (document.estado === EstadoBiblioteca.ARCHIVADO)
        throw new ConflictException("LIBRARY_DOCUMENT_ARCHIVED");
      const open = await tx.versionBiblioteca.findFirst({
        where: {
          documentoId: documentId,
          estado: {
            in: [EstadoBiblioteca.BORRADOR, EstadoBiblioteca.EN_REVISION],
          },
        },
        select: { id: true },
      });
      if (open) throw new ConflictException("LIBRARY_OPEN_VERSION_EXISTS");
      await tx.$executeRaw`SELECT id FROM Archivo WHERE id = ${input.archivoId} FOR UPDATE`;
      await this.file(actor, input.archivoId, tx);
      const latest = await tx.versionBiblioteca.aggregate({
        where: { documentoId: documentId },
        _max: { numero: true },
      });
      const version = await tx.versionBiblioteca.create({
        data: {
          documentoId: documentId,
          numero: (latest._max.numero ?? 0) + 1,
          archivoId: input.archivoId,
          autorId: actor.id,
          resumenCambios: input.resumenCambios,
          vigenteDesde: input.vigenteDesde
            ? new Date(input.vigenteDesde)
            : null,
          vigenteHasta: input.vigenteHasta
            ? new Date(input.vigenteHasta)
            : null,
        },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: actor.id,
          action: "LIBRARY_VERSION_CREATED",
          resource: "library_version",
          correlationId: version.id,
          metadata: { documentId, numero: version.numero },
        },
        tx,
      );
      return version;
    });
  }

  private async workflowVersion(client: any, id: string) {
    this.id(id);
    const version = await client.versionBiblioteca.findUnique({
      where: { id },
      include: { documento: true },
    });
    if (!version) throw new NotFoundException("LIBRARY_VERSION_NOT_FOUND");
    return version;
  }

  async submitReview(actor: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM VersionBiblioteca WHERE id = ${id} FOR UPDATE`;
      const version = await this.workflowVersion(tx, id);
      await this.assertTarget(
        actor,
        Permission.LIBRARY_DRAFT_CREATE,
        this.target(version.documento),
        tx,
      );
      if (version.estado !== EstadoBiblioteca.BORRADOR)
        throw new ConflictException("LIBRARY_VERSION_NOT_DRAFT");
      const updated = await tx.versionBiblioteca.update({
        where: { id },
        data: {
          estado: EstadoBiblioteca.EN_REVISION,
          submittedAt: new Date(),
          revisadoPorId: null,
          reviewedAt: null,
          retroalimentacion: null,
        },
      });
      const published = await tx.versionBiblioteca.count({
        where: {
          documentoId: version.documentoId,
          estado: EstadoBiblioteca.PUBLICADO,
        },
      });
      if (!published)
        await tx.documentoBiblioteca.update({
          where: { id: version.documentoId },
          data: { estado: EstadoBiblioteca.EN_REVISION },
        });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: version.autorId,
          action: "LIBRARY_VERSION_SUBMITTED",
          resource: "library_version",
          correlationId: id,
        },
        tx,
      );
      return updated;
    });
  }

  async review(actor: AuthUser, id: string, input: ReviewLibraryVersionInput) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM VersionBiblioteca WHERE id = ${id} FOR UPDATE`;
      const version = await this.workflowVersion(tx, id);
      await this.assertTarget(
        actor,
        Permission.LIBRARY_REVIEW,
        this.target(version.documento),
        tx,
      );
      if (version.estado !== EstadoBiblioteca.EN_REVISION)
        throw new ConflictException("LIBRARY_VERSION_NOT_IN_REVIEW");
      if (version.autorId === actor.id)
        throw new ConflictException("LIBRARY_AUTHOR_CANNOT_REVIEW");
      const approved = input.decision === "APPROVE";
      const updated = await tx.versionBiblioteca.update({
        where: { id },
        data: {
          estado: approved
            ? EstadoBiblioteca.EN_REVISION
            : EstadoBiblioteca.BORRADOR,
          revisadoPorId: actor.id,
          reviewedAt: new Date(),
          retroalimentacion: input.retroalimentacion ?? null,
        },
      });
      if (!approved) {
        const published = await tx.versionBiblioteca.count({
          where: {
            documentoId: version.documentoId,
            estado: EstadoBiblioteca.PUBLICADO,
          },
        });
        if (!published)
          await tx.documentoBiblioteca.update({
            where: { id: version.documentoId },
            data: { estado: EstadoBiblioteca.BORRADOR },
          });
      }
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: version.autorId,
          action: approved
            ? "LIBRARY_VERSION_REVIEWED"
            : "LIBRARY_VERSION_CHANGES_REQUESTED",
          resource: "library_version",
          correlationId: id,
          metadata: { decision: input.decision },
        },
        tx,
      );
      return updated;
    });
  }

  private async recipients(client: any, document: ScopeTarget) {
    if (document.alcance === AlcanceBiblioteca.PROYECTO) {
      const members = await client.miembroProyectoKairos.findMany({
        where: {
          proyectoId: document.proyectoId,
          removedAt: null,
          usuario: { estado: EstadoUsuario.ACTIVA },
        },
        select: { usuarioId: true },
      });
      return members.map((member: { usuarioId: number }) => member.usuarioId);
    }
    const where: any = { estado: EstadoUsuario.ACTIVA };
    if (document.alcance === AlcanceBiblioteca.SEDE)
      where.sedeId = document.sedeId;
    if (document.alcance === AlcanceBiblioteca.AREA) {
      where.sedeId = document.sedeId;
      where.areaId = document.areaId;
    }
    const users = await client.usuario.findMany({
      where,
      select: { id: true },
    });
    return users.map((user: { id: number }) => user.id);
  }

  async publish(
    actor: AuthUser,
    id: string,
    input: PublishLibraryVersionInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM VersionBiblioteca WHERE id = ${id} FOR UPDATE`;
      const version = await this.workflowVersion(tx, id);
      await tx.$executeRaw`SELECT id FROM DocumentoBiblioteca WHERE id = ${version.documentoId} FOR UPDATE`;
      await this.assertTarget(
        actor,
        Permission.LIBRARY_PUBLISH,
        this.target(version.documento),
        tx,
      );
      if (
        version.estado !== EstadoBiblioteca.EN_REVISION ||
        !version.revisadoPorId ||
        !version.reviewedAt
      )
        throw new ConflictException("LIBRARY_VERSION_NOT_APPROVED");
      const previous = await tx.versionBiblioteca.findFirst({
        where: {
          documentoId: version.documentoId,
          estado: EstadoBiblioteca.PUBLICADO,
          id: { not: id },
        },
      });
      if (previous && !input.motivoSustitucion)
        throw new BadRequestException("LIBRARY_REPLACEMENT_REASON_REQUIRED");
      const now = new Date();
      if (
        (version.vigenteDesde && version.vigenteDesde > now) ||
        (version.vigenteHasta && version.vigenteHasta <= now)
      )
        throw new BadRequestException(
          "LIBRARY_VERSION_OUTSIDE_EFFECTIVE_WINDOW",
        );
      if (previous)
        await tx.versionBiblioteca.update({
          where: { id: previous.id },
          data: {
            estado: EstadoBiblioteca.ARCHIVADO,
            archivedAt: now,
            vigenteHasta:
              previous.vigenteHasta && previous.vigenteHasta < now
                ? previous.vigenteHasta
                : now,
            motivoSustitucion: input.motivoSustitucion,
          },
        });
      const published = await tx.versionBiblioteca.update({
        where: { id },
        data: {
          estado: EstadoBiblioteca.PUBLICADO,
          publicadoPorId: actor.id,
          publishedAt: now,
          vigenteDesde: version.vigenteDesde ?? now,
          motivoSustitucion: input.motivoSustitucion ?? null,
        },
      });
      await tx.documentoBiblioteca.update({
        where: { id: version.documentoId },
        data: {
          estado: EstadoBiblioteca.PUBLICADO,
          motivoArchivo: null,
          archivadoAt: null,
          archivadoPorId: null,
        },
      });
      const recipientIds = await this.recipients(
        tx,
        this.target(version.documento),
      );
      if (recipientIds.length)
        await tx.notification.createMany({
          data: recipientIds.map((userId: number) => ({
            userId,
            type: "LIBRARY_PUBLISHED",
            payload: {
              documentId: version.documentoId,
              versionId: id,
              requiresAcknowledgement: version.documento.requiereAcuse,
            },
          })),
        });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: version.autorId,
          action: "LIBRARY_VERSION_PUBLISHED",
          resource: "library_version",
          correlationId: id,
          metadata: { replacedVersionId: previous?.id ?? null },
        },
        tx,
      );
      return published;
    });
  }

  async archive(actor: AuthUser, id: string, reason: string) {
    this.id(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM DocumentoBiblioteca WHERE id = ${id} FOR UPDATE`;
      const document = await tx.documentoBiblioteca.findUnique({
        where: { id },
      });
      if (!document) throw new NotFoundException("LIBRARY_DOCUMENT_NOT_FOUND");
      await this.assertTarget(
        actor,
        Permission.LIBRARY_ARCHIVE,
        this.target(document),
        tx,
      );
      if (document.estado === EstadoBiblioteca.ARCHIVADO)
        throw new ConflictException("LIBRARY_DOCUMENT_ARCHIVED");
      const now = new Date();
      await tx.versionBiblioteca.updateMany({
        where: {
          documentoId: id,
          estado: { not: EstadoBiblioteca.ARCHIVADO },
        },
        data: { estado: EstadoBiblioteca.ARCHIVADO, archivedAt: now },
      });
      const archived = await tx.documentoBiblioteca.update({
        where: { id },
        data: {
          estado: EstadoBiblioteca.ARCHIVADO,
          motivoArchivo: reason,
          archivadoPorId: actor.id,
          archivadoAt: now,
        },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: document.creadoPorId,
          action: "LIBRARY_DOCUMENT_ARCHIVED",
          resource: "library_document",
          correlationId: id,
          metadata: { reason },
        },
        tx,
      );
      return archived;
    });
  }

  private async readableVersion(actor: AuthUser, id: string) {
    this.id(id);
    const version = await this.prisma.versionBiblioteca.findUnique({
      where: { id },
      include: {
        documento: true,
        archivo: { select: { id: true, status: true } },
      },
    });
    if (!version) throw new NotFoundException("LIBRARY_VERSION_NOT_FOUND");
    const visible = await this.prisma.documentoBiblioteca.findFirst({
      where: { id: version.documentoId, ...this.visibility(actor) },
      select: { id: true },
    });
    if (!visible) throw new NotFoundException("LIBRARY_VERSION_NOT_FOUND");
    return version;
  }

  private isEffective(version: {
    vigenteDesde: Date | null;
    vigenteHasta: Date | null;
  }) {
    const now = new Date();
    return (
      (!version.vigenteDesde || version.vigenteDesde <= now) &&
      (!version.vigenteHasta || version.vigenteHasta > now)
    );
  }

  async download(actor: AuthUser, id: string) {
    const version = await this.readableVersion(actor, id);
    const published =
      version.estado === EstadoBiblioteca.PUBLICADO &&
      this.isEffective(version);
    let workflow = false;
    if (!published) {
      if (version.autorId === actor.id) workflow = true;
      for (const permission of [
        Permission.LIBRARY_REVIEW,
        Permission.LIBRARY_PUBLISH,
      ]) {
        if (workflow || getAccessScope(actor, permission) === null) continue;
        try {
          await this.assertTarget(
            actor,
            permission,
            this.target(version.documento),
          );
          workflow = true;
        } catch {}
      }
    }
    if (
      (!published && !workflow) ||
      version.archivo.status !== EstadoArchivo.DISPONIBLE
    )
      throw new NotFoundException("LIBRARY_VERSION_NOT_FOUND");
    await this.audit.append({
      actorId: actor.id,
      subjectId: actor.id,
      action: "LIBRARY_VERSION_DOWNLOADED",
      resource: "library_version",
      correlationId: id,
    });
    return this.storage.downloadUrl(
      version.archivo.id,
      issueDownloadCapability({
        subjectId: String(actor.id),
        resourceId: version.archivo.id,
        purpose: "download",
        issuedAt: new Date(),
      }),
      String(actor.id),
    );
  }

  async acknowledge(actor: AuthUser, id: string) {
    this.permission(actor, Permission.LIBRARY_ACKNOWLEDGE);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM VersionBiblioteca WHERE id = ${id} FOR UPDATE`;
      const version = await tx.versionBiblioteca.findUnique({
        where: { id },
        include: { documento: true },
      });
      if (
        !version ||
        version.estado !== EstadoBiblioteca.PUBLICADO ||
        !version.documento.requiereAcuse ||
        !this.isEffective(version)
      )
        throw new NotFoundException("LIBRARY_VERSION_NOT_FOUND");
      const visible = await tx.documentoBiblioteca.findFirst({
        where: { id: version.documentoId, ...this.visibility(actor) },
        select: { id: true },
      });
      if (!visible) throw new NotFoundException("LIBRARY_VERSION_NOT_FOUND");
      const existing = await tx.acuseBiblioteca.findUnique({
        where: { versionId_usuarioId: { versionId: id, usuarioId: actor.id } },
      });
      if (existing) return existing;
      const acknowledgement = await tx.acuseBiblioteca.create({
        data: { versionId: id, usuarioId: actor.id },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: actor.id,
          action: "LIBRARY_VERSION_ACKNOWLEDGED",
          resource: "library_version",
          correlationId: id,
          metadata: { legalAcceptance: false },
        },
        tx,
      );
      return acknowledgement;
    });
  }
}
