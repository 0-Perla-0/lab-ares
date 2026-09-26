import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { AuditService } from "../auth/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import {
  EstadoReporteExportacion,
  EstadoUsuario,
  TipoReporteExportacion,
} from "../generated/prisma/enums";
import { StorageService } from "../storage/storage.service";
import { issueDownloadCapability } from "../storage/storage.types";

type DateRange = { from: Date; to: Date };
type ReportRow = Record<string, unknown>;
type ReportData = { rows: ReportRow[]; headers: string[] };
type ReportFilters = {
  from: string;
  to: string;
  scope: AccessScope;
  sedeId: number | null;
  areaId: number | null;
};

const DAY_MS = 86_400_000;
const SYNC_EXPORT_LIMIT = 5_000;
const CUID_PATTERN = /^[a-z0-9]{20,30}$/;
const TERMINAL_KAIROS_STATES = ["TERMINADA", "CANCELADA"] as const;

class LeaseLostError extends Error {
  constructor() {
    super("REPORT_LEASE_LOST");
  }
}

@Injectable()
export class ReportsService {
  private readonly owner = randomUUID();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly config?: ConfigService<Environment, true>,
  ) {}

  private setting(
    key: "REPORTS_MAX_ATTEMPTS" | "REPORTS_LEASE_MS" | "REPORTS_RETRY_BASE_MS",
    fallback: number,
  ) {
    return this.config?.get(key) ?? fallback;
  }

  private dates(input: {
    from?: string | Date;
    to?: string | Date;
  }): DateRange {
    const now = Date.now();
    const from = input.from
      ? new Date(input.from)
      : new Date(now - 30 * DAY_MS);
    const to = input.to ? new Date(input.to) : new Date(now);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to ||
      to.getTime() - from.getTime() > 365 * DAY_MS
    )
      throw new BadRequestException("INVALID_REPORT_RANGE");
    return { from, to };
  }

  private scope(actor: AuthUser, permission: Permission) {
    if (actor.estado !== EstadoUsuario.ACTIVA) throw new ForbiddenException();
    const scope = getAccessScope(actor, permission);
    if (
      !scope ||
      (scope !== AccessScope.GLOBAL && actor.sedeId == null) ||
      (scope === AccessScope.AREA && actor.areaId == null)
    )
      throw new ForbiddenException();
    return scope;
  }

  private organizationUserWhere(actor: AuthUser, scope: AccessScope) {
    const active = { estado: EstadoUsuario.ACTIVA };
    if (scope === AccessScope.GLOBAL) return active;
    if (scope === AccessScope.SEDE) return { ...active, sedeId: actor.sedeId };
    return { ...active, sedeId: actor.sedeId, areaId: actor.areaId };
  }

  private reportWhere(
    actor: AuthUser,
    type: TipoReporteExportacion,
    range: DateRange,
  ) {
    const scope = this.scope(actor, Permission.REPORTS_EXPORT);
    const user = this.organizationUserWhere(actor, scope);
    if (type === TipoReporteExportacion.ATTENDANCE)
      return { user, checkInAt: { gte: range.from, lt: range.to } };
    if (type === TipoReporteExportacion.DOCUMENTS)
      return {
        requisito: { usuario: user },
        createdAt: { gte: range.from, lt: range.to },
      };
    return {
      createdAt: { gte: range.from, lt: range.to },
      responsable: user,
    };
  }

  async metrics(actor: AuthUser, input: { from?: string; to?: string }) {
    const scope = this.scope(actor, Permission.REPORTS_READ);
    const range = this.dates(input);
    const user = this.organizationUserWhere(actor, scope);
    const attendanceWhere = {
      user,
      checkInAt: { gte: range.from, lt: range.to },
    };
    const documentsWhere = {
      requisito: { usuario: user },
      createdAt: { gte: range.from, lt: range.to },
    };
    const kairosWhere = {
      createdAt: { gte: range.from, lt: range.to },
      responsable: user,
    };
    const [attendance, documents, kairosByState, kairosOverdue] =
      await Promise.all([
        this.prisma.asistencia.groupBy({
          by: ["status"],
          where: attendanceWhere,
          _count: { _all: true },
          _sum: { durationSeconds: true },
        }),
        this.prisma.documentoVersion.groupBy({
          by: ["estado"],
          where: documentsWhere,
          _count: { _all: true },
        }),
        this.prisma.actividadKairos.groupBy({
          by: ["state"],
          where: kairosWhere,
          _count: { _all: true },
        }),
        this.prisma.actividadKairos.count({
          where: {
            ...kairosWhere,
            dueAt: { lt: range.to },
            state: { notIn: [...TERMINAL_KAIROS_STATES] },
          },
        }),
      ]);
    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      attendance,
      documents,
      kairos: { byState: kairosByState, overdue: kairosOverdue },
      semantics:
        "from inclusive, to exclusive; overdue is dueAt < to and state not TERMINADA/CANCELADA",
    };
  }

  private safe(value: unknown) {
    let text = String(value ?? "").replace(/[\r\n]/g, " ");
    if (/^[\t ]*[=+\-@]/.test(text)) text = `'${text}`;
    return text;
  }

  private csv(rows: ReportRow[], headers: string[]) {
    const quote = (value: unknown) =>
      `"${this.safe(value).replace(/"/g, '""')}"`;
    const content = [
      headers,
      ...rows.map((row) => headers.map((header) => row[header])),
    ]
      .map((row) => row.map(quote).join(","))
      .join("\r\n");
    return Buffer.from(`\uFEFF${content}\r\n`, "utf8");
  }

  private async countRows(
    actor: AuthUser,
    type: TipoReporteExportacion,
    range: DateRange,
  ) {
    const where = this.reportWhere(actor, type, range);
    if (type === TipoReporteExportacion.ATTENDANCE)
      return this.prisma.asistencia.count({ where });
    if (type === TipoReporteExportacion.DOCUMENTS)
      return this.prisma.documentoVersion.count({ where });
    return this.prisma.actividadKairos.count({ where });
  }

  private async rows(
    actor: AuthUser,
    type: TipoReporteExportacion,
    range: DateRange,
  ): Promise<ReportData> {
    const where = this.reportWhere(actor, type, range);
    if (type === TipoReporteExportacion.ATTENDANCE) {
      const rows = await this.prisma.asistencia.findMany({
        where,
        orderBy: { id: "asc" },
        select: {
          id: true,
          userId: true,
          status: true,
          checkInAt: true,
          checkOutAt: true,
          durationSeconds: true,
        },
      });
      return {
        rows: rows.map((row) => ({
          ...row,
          checkInAt: row.checkInAt.toISOString(),
          checkOutAt: row.checkOutAt?.toISOString(),
        })),
        headers: [
          "id",
          "userId",
          "status",
          "checkInAt",
          "checkOutAt",
          "durationSeconds",
        ],
      };
    }
    if (type === TipoReporteExportacion.DOCUMENTS) {
      const rows = await this.prisma.documentoVersion.findMany({
        where,
        orderBy: { id: "asc" },
        select: {
          id: true,
          estado: true,
          version: true,
          createdAt: true,
          requisitoId: true,
        },
      });
      return {
        rows: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
        headers: ["id", "estado", "version", "createdAt", "requisitoId"],
      };
    }
    const rows = await this.prisma.actividadKairos.findMany({
      where,
      orderBy: { id: "asc" },
      select: {
        id: true,
        proyectoId: true,
        title: true,
        state: true,
        dueAt: true,
      },
    });
    return {
      rows: rows.map((row) => ({ ...row, dueAt: row.dueAt?.toISOString() })),
      headers: ["id", "proyectoId", "title", "state", "dueAt"],
    };
  }

  async requestExport(
    actor: AuthUser,
    input: { type: TipoReporteExportacion; from?: string; to?: string },
  ) {
    const range = this.dates(input);
    const type = input.type as TipoReporteExportacion;
    const requestedScope = this.scope(actor, Permission.REPORTS_EXPORT);
    const totalRows = await this.countRows(actor, type, range);
    if (totalRows <= SYNC_EXPORT_LIMIT) {
      const correlationId = `sync:${type}:${randomUUID()}`;
      await this.audit.append({
        actorId: actor.id,
        subjectId: actor.id,
        action: "REPORT_EXPORT_REQUESTED",
        resource: "report_export",
        correlationId,
        metadata: { type, totalFilas: totalRows, mode: "sync" },
      });
      const data = await this.rows(actor, type, range);
      await this.audit.append({
        actorId: actor.id,
        subjectId: actor.id,
        action: "REPORT_EXPORT_COMPLETED",
        resource: "report_export",
        correlationId,
        metadata: { type, totalFilas: data.rows.length, mode: "sync" },
      });
      return {
        sync: true as const,
        body: this.csv(data.rows, data.headers),
        filename: `reporte-${type.toLowerCase()}.csv`,
      };
    }
    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reporteExportacion.create({
        data: {
          requesterId: actor.id,
          type,
          filters: {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            scope: requestedScope,
            sedeId: actor.sedeId,
            areaId: actor.areaId,
          },
          totalFilas: totalRows,
          nextAttemptAt: new Date(),
        },
      });
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: actor.id,
          action: "REPORT_EXPORT_REQUESTED",
          resource: "report_export",
          correlationId: created.id,
          metadata: { type, totalFilas: totalRows, mode: "async" },
        },
        tx,
      );
      return created;
    });
    return {
      sync: false as const,
      job: { id: job.id, status: job.status, totalFilas: job.totalFilas },
    };
  }

  private validateId(id: string) {
    if (!CUID_PATTERN.test(id))
      throw new BadRequestException("INVALID_REPORT_ID");
  }

  async status(actor: AuthUser, id: string) {
    this.scope(actor, Permission.REPORTS_EXPORT);
    this.validateId(id);
    const job = await this.prisma.reporteExportacion.findFirst({
      where: { id, requesterId: actor.id },
      select: {
        id: true,
        type: true,
        status: true,
        totalFilas: true,
        errorCode: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!job) throw new NotFoundException();
    return job;
  }

  async download(actor: AuthUser, id: string) {
    this.scope(actor, Permission.REPORTS_EXPORT);
    this.validateId(id);
    const fileId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM ReporteExportacion WHERE id = ${id} FOR UPDATE`;
      const job = await tx.reporteExportacion.findFirst({
        where: { id, requesterId: actor.id },
        select: { status: true, archivoId: true, expiresAt: true },
      });
      if (
        !job ||
        job.status !== EstadoReporteExportacion.COMPLETADO ||
        !job.archivoId ||
        !job.expiresAt ||
        job.expiresAt <= new Date()
      )
        throw new NotFoundException();
      await this.audit.append(
        {
          actorId: actor.id,
          subjectId: actor.id,
          action: "REPORT_EXPORT_DOWNLOADED",
          resource: "report_export",
          correlationId: id,
          metadata: { result: "authorized" },
        },
        tx,
      );
      return job.archivoId;
    });
    return this.storage.downloadUrl(
      fileId,
      issueDownloadCapability({
        subjectId: String(actor.id),
        resourceId: fileId,
        purpose: "download",
        issuedAt: new Date(),
      }),
      String(actor.id),
    );
  }

  private async requester(id: number): Promise<AuthUser> {
    const user = await this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        codigo: true,
        email: true,
        rol: true,
        estado: true,
        sedeId: true,
        areaId: true,
        turnoId: true,
      },
    });
    if (!user || user.estado !== EstadoUsuario.ACTIVA)
      throw new Error("REQUESTER_INACTIVE");
    try {
      this.scope(user, Permission.REPORTS_EXPORT);
    } catch {
      throw new Error("REPORT_PERMISSION_REVOKED");
    }
    return user;
  }

  private assertUnchangedScope(actor: AuthUser, filters: ReportFilters) {
    if (!Object.values(AccessScope).includes(filters.scope))
      throw new Error("REPORT_SCOPE_SNAPSHOT_MISSING");
    const currentScope = this.scope(actor, Permission.REPORTS_EXPORT);
    const organizationChanged =
      filters.scope !== AccessScope.GLOBAL &&
      (actor.sedeId !== filters.sedeId ||
        (filters.scope === AccessScope.AREA &&
          actor.areaId !== filters.areaId));
    if (currentScope !== filters.scope || organizationChanged)
      throw new Error("REPORT_SCOPE_CHANGED");
  }

  private errorCode(error: unknown) {
    const message =
      error instanceof Error ? error.message : "GENERATION_FAILED";
    return message.replace(/[^A-Z0-9_.-]/gi, "_").slice(0, 100);
  }

  async processDue(limit = 10) {
    const now = new Date();
    const maxAttempts = this.setting("REPORTS_MAX_ATTEMPTS", 3);
    const leaseMs = this.setting("REPORTS_LEASE_MS", 120_000);
    const retryBaseMs = this.setting("REPORTS_RETRY_BASE_MS", 60_000);
    await this.prisma.reporteExportacion.updateMany({
      where: {
        status: EstadoReporteExportacion.GENERANDO,
        leaseUntil: { lt: now },
        attempts: { lt: maxAttempts },
      },
      data: {
        status: EstadoReporteExportacion.PENDIENTE,
        leaseOwner: null,
        leaseUntil: null,
        nextAttemptAt: now,
        errorCode: "LEASE_EXPIRED_RETRY",
      },
    });
    await this.prisma.reporteExportacion.updateMany({
      where: {
        status: EstadoReporteExportacion.GENERANDO,
        leaseUntil: { lt: now },
        attempts: { gte: maxAttempts },
      },
      data: {
        status: EstadoReporteExportacion.FALLIDO,
        leaseOwner: null,
        leaseUntil: null,
        nextAttemptAt: null,
        errorCode: "LEASE_EXPIRED_MAX_ATTEMPTS",
      },
    });
    const jobs = await this.prisma.reporteExportacion.findMany({
      where: {
        status: EstadoReporteExportacion.PENDIENTE,
        attempts: { lt: maxAttempts },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { createdAt: "asc" },
      take: Math.min(Math.max(limit, 1), 50),
    });
    let claimed = 0;
    for (const job of jobs) {
      const claim = await this.prisma.reporteExportacion.updateMany({
        where: {
          id: job.id,
          status: EstadoReporteExportacion.PENDIENTE,
          attempts: { lt: maxAttempts },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        data: {
          status: EstadoReporteExportacion.GENERANDO,
          leaseOwner: this.owner,
          leaseUntil: new Date(Date.now() + leaseMs),
          attempts: { increment: 1 },
          nextAttemptAt: null,
          errorCode: null,
        },
      });
      if (!claim.count) continue;
      claimed += 1;
      const attempt = job.attempts + 1;
      let generatedFileId: string | undefined;
      try {
        const actor = await this.requester(job.requesterId);
        const filters = job.filters as ReportFilters;
        this.assertUnchangedScope(actor, filters);
        const range = this.dates(filters);
        const data = await this.rows(actor, job.type, range);
        const file = await this.storage.storeGeneratedCsv(
          job.requesterId,
          job.id,
          this.csv(data.rows, data.headers),
        );
        generatedFileId = file.id;
        await this.prisma.$transaction(async (tx) => {
          const completed = await tx.reporteExportacion.updateMany({
            where: {
              id: job.id,
              leaseOwner: this.owner,
              status: EstadoReporteExportacion.GENERANDO,
              leaseUntil: { gt: new Date() },
            },
            data: {
              status: EstadoReporteExportacion.COMPLETADO,
              archivoId: file.id,
              totalFilas: data.rows.length,
              expiresAt: new Date(Date.now() + DAY_MS),
              leaseOwner: null,
              leaseUntil: null,
              nextAttemptAt: null,
              errorCode: null,
            },
          });
          if (!completed.count) throw new LeaseLostError();
          await this.audit.append(
            {
              actorId: job.requesterId,
              subjectId: job.requesterId,
              action: "REPORT_EXPORT_COMPLETED",
              resource: "report_export",
              correlationId: job.id,
              metadata: { totalFilas: data.rows.length },
            },
            tx,
          );
        });
        generatedFileId = undefined;
      } catch (error) {
        if (generatedFileId) {
          try {
            await this.storage.removeGenerated(generatedFileId);
          } catch {
            // The orphan remains discoverable by ownership metadata for reconciliation.
          }
        }
        if (error instanceof LeaseLostError) continue;
        const code = this.errorCode(error);
        const permanent =
          code === "REQUESTER_INACTIVE" ||
          code === "REPORT_PERMISSION_REVOKED" ||
          code === "REPORT_SCOPE_SNAPSHOT_MISSING" ||
          code === "REPORT_SCOPE_CHANGED" ||
          attempt >= maxAttempts;
        const nextAttemptAt = permanent
          ? null
          : new Date(Date.now() + retryBaseMs * 2 ** Math.max(0, attempt - 1));
        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.reporteExportacion.updateMany({
            where: {
              id: job.id,
              leaseOwner: this.owner,
              status: EstadoReporteExportacion.GENERANDO,
            },
            data: {
              status: permanent
                ? EstadoReporteExportacion.FALLIDO
                : EstadoReporteExportacion.PENDIENTE,
              errorCode: code,
              leaseOwner: null,
              leaseUntil: null,
              nextAttemptAt,
            },
          });
          if (updated.count)
            await this.audit.append(
              {
                actorId: job.requesterId,
                subjectId: job.requesterId,
                action: "REPORT_EXPORT_FAILED",
                resource: "report_export",
                correlationId: job.id,
                metadata: { errorCode: code, retry: !permanent },
              },
              tx,
            );
        });
      }
    }
    return claimed;
  }

  async cleanup() {
    const jobs = await this.prisma.reporteExportacion.findMany({
      where: {
        status: EstadoReporteExportacion.COMPLETADO,
        expiresAt: { lt: new Date() },
      },
      select: { id: true, requesterId: true, archivoId: true },
      take: 50,
    });
    let expired = 0;
    for (const job of jobs) {
      try {
        if (job.archivoId) await this.storage.removeGenerated(job.archivoId);
      } catch {
        continue;
      }
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.reporteExportacion.updateMany({
          where: {
            id: job.id,
            status: EstadoReporteExportacion.COMPLETADO,
            archivoId: job.archivoId,
            expiresAt: { lt: new Date() },
          },
          data: {
            status: EstadoReporteExportacion.EXPIRADO,
            archivoId: null,
            errorCode: null,
          },
        });
        if (updated.count) {
          expired += 1;
          await this.audit.append(
            {
              actorId: job.requesterId,
              subjectId: job.requesterId,
              action: "REPORT_EXPORT_EXPIRED",
              resource: "report_export",
              correlationId: job.id,
              metadata: { result: "expired" },
            },
            tx,
          );
        }
      });
    }
    return expired;
  }
}
