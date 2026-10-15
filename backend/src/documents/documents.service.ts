import { Injectable, Optional } from "@nestjs/common";
import { FeaturePoliciesService } from "../common/domain/feature-policies.service";
import { randomUUID } from "node:crypto";
import { DomainTransaction } from "../common/domain/domain-transaction";
import { operationalNotification } from "../common/domain/operational-notification";
import type { Prisma } from "../generated/prisma/client";
import {
  DOCUMENT_MAX_BYTES,
  type FormalizationInput,
} from "./documents.schemas";
import { PrismaService } from "../database/prisma.service";
import {
  EstadoArchivo,
  EstadoDocumento,
  EstadoUsuario,
} from "../generated/prisma/enums";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import type { AuthUser } from "../auth/auth-user";
import {
  conflict,
  invalidInput,
  notFound,
} from "../common/errors/domain-error";
import { issueDownloadCapability } from "../storage/storage.types";
import { StorageService } from "../storage/storage.service";
import type {
  RequirementInput,
  ReviewInput,
  UploadInput,
} from "./documents.schemas";
import { AuditService } from "../auth/audit.service";

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService = null as any,
    @Optional() private readonly features?: FeaturePoliciesService,
  ) {}
  private scope(actor: AuthUser) {
    if (actor.estado !== EstadoUsuario.ACTIVA)
      throw notFound("DOCUMENT_NOT_FOUND");
    return getAccessScope(actor, Permission.DOCUMENTS_READ) ?? AccessScope.SELF;
  }
  private async target(id: number) {
    const r = await this.prisma.requisitoDocumento.findUnique({
      where: { id },
      include: {
        usuario: {
          select: { id: true, sedeId: true, areaId: true, estado: true },
        },
      },
    });
    if (!r || !r.activo || r.usuario.estado !== EstadoUsuario.ACTIVA)
      throw notFound("DOCUMENT_NOT_FOUND");
    return r;
  }
  private allowed(
    actor: AuthUser,
    user: { id: number; sedeId: number | null; areaId: number | null },
  ) {
    const s = this.scope(actor);
    return (
      s === AccessScope.GLOBAL ||
      (s === AccessScope.SEDE && actor.sedeId === user.sedeId) ||
      (s === AccessScope.AREA && actor.areaId === user.areaId) ||
      (s === AccessScope.SELF && actor.id === user.id)
    );
  }
  async createRequirement(
    actor: AuthUser,
    input: RequirementInput,
    key: string = randomUUID(),
  ) {
    if (this.scope(actor) !== AccessScope.GLOBAL)
      throw invalidInput("DOCUMENT_REQUIREMENT_NOT_ALLOWED");
    const target = await this.prisma.usuario.findUnique({
      where: { id: input.usuarioId },
      select: { id: true, rol: true, estado: true },
    });
    if (
      !target ||
      target.estado !== EstadoUsuario.ACTIVA ||
      target.rol !== "PRESTADOR"
    )
      throw notFound("DOCUMENT_NOT_FOUND");
    return new DomainTransaction(this.prisma).run(
      actor,
      key,
      { action: "DOCUMENT_REQUIREMENT", input },
      async (tx) => {
        await this.features?.requireInTransaction(tx, "DOCUMENTS", actor);
        await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${target.id} FOR UPDATE`;
        const fresh = await tx.usuario.findUnique({ where: { id: target.id } });
        if (
          !fresh ||
          fresh.estado !== EstadoUsuario.ACTIVA ||
          fresh.rol !== "PRESTADOR"
        )
          throw notFound("DOCUMENT_NOT_FOUND");
        const created = await tx.requisitoDocumento.create({
          data: {
            usuarioId: target.id,
            codigo: input.codigo,
            nombre: input.nombre,
            obligatorio: input.obligatorio,
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: target.id,
            action: "DOCUMENT_REQUIREMENT_CREATED",
            resource: "document_requirement",
            correlationId: String(created.id),
            metadata: { result: "created" },
          },
          tx,
        );
        return created;
      },
      async (tx) => {
        const fresh = await tx.usuario.findUnique({ where: { id: target.id } });
        if (
          !fresh ||
          fresh.estado !== EstadoUsuario.ACTIVA ||
          this.scope(actor) !== AccessScope.GLOBAL
        )
          throw notFound("DOCUMENT_NOT_FOUND");
      },
    );
  }
  async list(actor: AuthUser, userId = actor.id, page = 1, pageSize = 50) {
    const target = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, sedeId: true, areaId: true, estado: true },
    });
    if (
      !target ||
      target.estado !== EstadoUsuario.ACTIVA ||
      !this.allowed(actor, target)
    )
      throw notFound("DOCUMENT_NOT_FOUND");
    const take = Math.min(Math.max(pageSize, 1), 100),
      skip = (Math.max(page, 1) - 1) * take;
    const where = { usuarioId: userId, activo: true };
    const [items, total] = await Promise.all([
      this.prisma.requisitoDocumento.findMany({
        where,
        select: {
          id: true,
          usuarioId: true,
          codigo: true,
          nombre: true,
          obligatorio: true,
          activo: true,
          createdAt: true,
          updatedAt: true,
          versiones: {
            orderBy: { version: "desc" },
            take: 1,
            select: {
              id: true,
              version: true,
              estado: true,
              comentario: true,
              createdAt: true,
              updatedAt: true,
              archivo: {
                select: {
                  id: true,
                  originalName: true,
                  detectedMime: true,
                  sizeBytes: true,
                  status: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
        orderBy: { id: "asc" },
        skip,
        take,
      }),
      this.prisma.requisitoDocumento.count({ where }),
    ]);
    return { items, total, page: Math.max(page, 1), pageSize: take };
  }
  async upload(
    actor: AuthUser,
    input: UploadInput,
    key: string = randomUUID(),
  ) {
    return new DomainTransaction(this.prisma).run(
      actor,
      key,
      { action: "DOCUMENT_UPLOAD", input },
      async (tx) => {
        await this.features?.requireInTransaction(
          tx,
          "DOCUMENTS.UPLOAD",
          actor,
        );
        await tx.$executeRaw`SELECT id FROM RequisitoDocumento WHERE id = ${input.requisitoId} FOR UPDATE`;
        const req = await tx.requisitoDocumento.findUnique({
          where: { id: input.requisitoId },
          include: { usuario: { select: { id: true, estado: true } } },
        });
        if (
          !req ||
          !req.activo ||
          req.usuario.estado !== EstadoUsuario.ACTIVA ||
          actor.id !== req.usuarioId
        )
          throw notFound("DOCUMENT_NOT_FOUND");
        await tx.$executeRaw`SELECT id FROM Archivo WHERE id = ${input.archivoId} FOR UPDATE`;
        const file = await tx.archivo.findUnique({
          where: { id: input.archivoId },
          select: {
            id: true,
            status: true,
            detectedMime: true,
            propietarioId: true,
            sizeBytes: true,
          },
        });
        if (
          !file ||
          file.propietarioId !== actor.id ||
          file.status !== EstadoArchivo.DISPONIBLE ||
          !["application/pdf", "image/jpeg", "image/png"].includes(
            file.detectedMime ?? "",
          )
        )
          throw invalidInput("DOCUMENT_FILE_NOT_AVAILABLE");
        if (
          file.sizeBytes == null ||
          file.sizeBytes <= 0n ||
          file.sizeBytes > BigInt(DOCUMENT_MAX_BYTES)
        )
          throw invalidInput("DOCUMENT_FILE_TOO_LARGE");
        const pending = await tx.documentoVersion.findFirst({
          where: {
            requisitoId: req.id,
            estado: {
              in: [
                EstadoDocumento.EN_REVISION,
                EstadoDocumento.PENDIENTE_CARGA,
              ],
            },
          },
        });
        if (pending) throw conflict("DOCUMENT_PENDING_VERSION_EXISTS");
        const latest = await tx.documentoVersion.findFirst({
          where: { requisitoId: req.id },
          orderBy: { version: "desc" },
        });
        const created = await tx.documentoVersion.create({
          data: {
            requisitoId: req.id,
            archivoId: file.id,
            version: (latest?.version ?? 0) + 1,
            estado: EstadoDocumento.EN_REVISION,
            cargadoPorId: actor.id,
            reportSedeId: actor.sedeId,
            reportAreaId: actor.areaId,
            reportSnapshotAt: new Date(),
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: req.usuarioId,
            action: "DOCUMENT_VERSION_UPLOADED",
            resource: "document_version",
            correlationId: created.id,
            metadata: { result: "created", version: created.version },
          },
          tx,
        );
        return created;
      },
      (tx) => this.authorizeReceipt(tx, actor, input.requisitoId, true),
    );
  }
  async review(
    actor: AuthUser,
    id: string,
    input: ReviewInput,
    key: string = randomUUID(),
  ) {
    return new DomainTransaction(this.prisma).run(
      actor,
      key,
      { action: "DOCUMENT_REVIEW", id, input },
      async (tx) => {
        if (actor.estado !== EstadoUsuario.ACTIVA)
          throw notFound("DOCUMENT_NOT_FOUND");
        await tx.$executeRaw`SELECT id FROM DocumentoVersion WHERE id = ${id} FOR UPDATE`;
        const item = await tx.documentoVersion.findUnique({
          where: { id },
          select: {
            estado: true,
            cargadoPorId: true,
            requisito: {
              select: {
                id: true,
                usuario: {
                  select: {
                    id: true,
                    sedeId: true,
                    areaId: true,
                    estado: true,
                  },
                },
              },
            },
          },
        });
        if (
          !item ||
          item.requisito.usuario.estado !== EstadoUsuario.ACTIVA ||
          !this.allowed(actor, item.requisito.usuario) ||
          actor.id === item.cargadoPorId
        )
          throw notFound("DOCUMENT_NOT_FOUND");
        if (item.estado !== EstadoDocumento.EN_REVISION)
          throw conflict("DOCUMENT_ALREADY_REVIEWED");
        const updated = await tx.documentoVersion.update({
          where: { id },
          data: {
            estado: input.estado as EstadoDocumento,
            comentario: input.comentario ?? null,
            revisadoPorId: actor.id,
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: item.requisito.usuario.id,
            action: "DOCUMENT_VERSION_REVIEWED",
            resource: "document_version",
            correlationId: id,
            metadata: { result: input.estado },
          },
          tx,
        );
        return updated;
      },
      async (tx) => {
        const item = await tx.documentoVersion.findUnique({
          where: { id },
          select: { requisitoId: true },
        });
        if (!item) throw notFound("DOCUMENT_NOT_FOUND");
        await this.authorizeReceipt(tx, actor, item.requisitoId);
      },
    );
  }
  private async authorizeReceipt(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    requirementId: number,
    own = false,
  ) {
    const req = await tx.requisitoDocumento.findUnique({
      where: { id: requirementId },
      include: { usuario: true },
    });
    if (
      !req?.activo ||
      req.usuario.estado !== EstadoUsuario.ACTIVA ||
      !this.allowed(actor, req.usuario) ||
      (own && actor.id !== req.usuarioId)
    )
      throw notFound("DOCUMENT_NOT_FOUND");
  }

  async formalizations(actor: AuthUser, userId = actor.id) {
    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
    });
    if (!user || !this.allowed(actor, user))
      throw notFound("DOCUMENT_NOT_FOUND");
    return this.prisma.formalizacionExpediente.findMany({
      where: { usuarioId: userId },
      orderBy: { inicio: "desc" },
      take: 100,
    });
  }

  async formalize(actor: AuthUser, key: string, input: FormalizationInput) {
    const authorize = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM Usuario WHERE id = ${input.usuarioId} FOR UPDATE`;
      const user = await tx.usuario.findUnique({
        where: { id: input.usuarioId },
      });
      if (
        !user ||
        user.estado !== EstadoUsuario.ACTIVA ||
        user.rol !== "PRESTADOR" ||
        !getAccessScope(actor, Permission.DOCUMENTS_REVIEW) ||
        !this.allowed(actor, user) ||
        actor.id === user.id
      )
        throw notFound("DOCUMENT_NOT_FOUND");
      return user;
    };
    return new DomainTransaction(this.prisma).run(
      actor,
      key,
      { action: "EXPEDIENT_FORMALIZE", input },
      async (tx) => {
        await this.features?.requireInTransaction(
          tx,
          "DOCUMENTS.FORMALIZE",
          actor,
        );
        const user = await authorize(tx);
        const inicio = new Date(`${input.inicio}T00:00:00.000Z`);
        const academic = await tx.adscripcionAcademica.findFirst({
          where: {
            usuarioId: user.id,
            estado: "CONFIRMADA",
            vigente: true,
            inicio: { lte: inicio },
            OR: [{ fin: null }, { fin: { gte: inicio } }],
          },
          include: {
            institucion: true,
            unidadAcademica: true,
            programaAcademico: { include: { unidadAcademica: true } },
            cohorte: true,
          },
        });
        if (!academic) throw conflict("ACADEMIC_FORMALIZATION_REQUIRED");
        // Official confirmation shares the Usuario lock; catalog rows are also
        // locked so deactivation cannot race the snapshot of a new formalization.
        await tx.$queryRaw`SELECT id FROM InstitucionAcademica WHERE id = ${academic.institucionId} LOCK IN SHARE MODE`;
        await tx.$queryRaw`SELECT id FROM ProgramaAcademico WHERE id = ${academic.programaAcademicoId} LOCK IN SHARE MODE`;
        await tx.$queryRaw`SELECT id FROM UnidadAcademica WHERE id = ${academic.programaAcademico.unidadAcademicaId} LOCK IN SHARE MODE`;
        if (academic.cohorteId)
          await tx.$queryRaw`SELECT id FROM CohorteAcademica WHERE id = ${academic.cohorteId} LOCK IN SHARE MODE`;
        const fresh = await tx.adscripcionAcademica.findUniqueOrThrow({
          where: { id: academic.id },
          include: {
            institucion: true,
            unidadAcademica: true,
            programaAcademico: { include: { unidadAcademica: true } },
            cohorte: true,
          },
        });
        if (
          !fresh.institucion.activa ||
          !fresh.programaAcademico.activa ||
          !fresh.programaAcademico.unidadAcademica.activa ||
          (fresh.cohorte && !fresh.cohorte.activa) ||
          fresh.programaAcademico.unidadAcademica.institucionId !==
            fresh.institucionId ||
          (fresh.unidadAcademicaId != null &&
            fresh.unidadAcademicaId !==
              fresh.programaAcademico.unidadAcademicaId)
        )
          throw conflict("ACADEMIC_REFERENCE_CHANGED");
        if (
          await tx.formalizacionExpediente.findUnique({
            where: { usuarioId_inicio: { usuarioId: user.id, inicio } },
          })
        )
          throw conflict("EXPEDIENT_ALREADY_FORMALIZED");
        // Freeze the documentary projection while review transactions resolve.
        // The Usuario lock also serializes requirement creation and owner uploads.
        await tx.$queryRaw`SELECT id FROM RequisitoDocumento WHERE usuarioId = ${user.id} ORDER BY id LOCK IN SHARE MODE`;
        await tx.$queryRaw`SELECT d.id FROM DocumentoVersion d JOIN RequisitoDocumento r ON r.id = d.requisitoId WHERE r.usuarioId = ${user.id} ORDER BY d.id LOCK IN SHARE MODE`;
        const requirements = await tx.requisitoDocumento.findMany({
          where: { usuarioId: user.id, activo: true },
          orderBy: { id: "asc" },
          select: {
            id: true,
            codigo: true,
            obligatorio: true,
            versiones: {
              orderBy: { version: "desc" },
              take: 1,
              select: { id: true, version: true, estado: true },
            },
          },
        });
        const created = await tx.formalizacionExpediente.create({
          data: {
            usuarioId: user.id,
            inicio,
            adscripcionId: fresh.id,
            sedeId: user.sedeId,
            areaId: user.areaId,
            formalizadoPorId: actor.id,
            academicSnapshot: {
              adscripcionId: fresh.id,
              institucionId: fresh.institucionId,
              institucion: fresh.institucion.nombre,
              programaId: fresh.programaAcademicoId,
              programa: fresh.programaAcademico.nombre,
              unidadId: fresh.programaAcademico.unidadAcademicaId,
              unidad: fresh.programaAcademico.unidadAcademica.nombre,
              cohorteId: fresh.cohorteId,
              cohorte: fresh.cohorte?.nombre ?? null,
            },
            documentSnapshot: requirements,
          },
        });
        await this.audit.append(
          {
            actorId: actor.id,
            subjectId: user.id,
            action: "EXPEDIENT_FORMALIZED",
            module: "DOCUMENTS",
            resource: "expedient_formalization",
            objectId: created.id,
            sedeId: user.sedeId ?? undefined,
            areaId: user.areaId ?? undefined,
            metadata: { inicio: input.inicio, adscripcionId: fresh.id },
          },
          tx,
        );
        await operationalNotification(tx, user.id, "EXPEDIENT_FORMALIZED", {
          formalizationId: created.id,
          inicio: input.inicio,
        });
        return created;
      },
      async (tx) => {
        await authorize(tx);
      },
    );
  }
  async download(actor: AuthUser, id: string) {
    const archivoId = await this.prisma.$transaction(async (tx) => {
      if (actor.estado !== EstadoUsuario.ACTIVA)
        throw notFound("DOCUMENT_NOT_FOUND");
      await tx.$executeRaw`SELECT id FROM DocumentoVersion WHERE id = ${id} FOR UPDATE`;
      const item = await tx.documentoVersion.findUnique({
        where: { id },
        select: {
          archivoId: true,
          estado: true,
          requisito: {
            select: {
              id: true,
              usuario: {
                select: { id: true, sedeId: true, areaId: true, estado: true },
              },
            },
          },
        },
      });
      if (
        !item ||
        item.requisito.usuario.estado !== EstadoUsuario.ACTIVA ||
        !this.allowed(actor, item.requisito.usuario) ||
        item.estado !== EstadoDocumento.AUTORIZADO
      )
        throw notFound("DOCUMENT_NOT_FOUND");
      await tx.$executeRaw`SELECT id FROM Archivo WHERE id = ${item.archivoId} FOR UPDATE`;
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: item.requisito.usuario.id,
          action: "DOCUMENT_DOWNLOAD_REQUESTED",
          resource: "document_version",
          correlationId: id,
          metadata: { result: "authorized" },
        },
        tx,
      );
      return item.archivoId;
    });
    return this.storage.downloadUrl(
      archivoId,
      issueDownloadCapability({
        subjectId: String(actor.id),
        resourceId: archivoId,
        purpose: "download",
        issuedAt: new Date(),
      }),
      String(actor.id),
    );
  }
}
