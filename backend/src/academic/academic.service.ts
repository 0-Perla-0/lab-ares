import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { invalidInput, conflict, notFound } from "../common/errors/domain-error";
import type { CatalogInput, ProfileInput } from "./academic.schemas";
import { AccessScope, getAccessScope, Permission } from "../auth/permissions";
import type { AuthUser } from "../auth/auth-user";
import { EstadoUsuario } from "../generated/prisma/enums";

function dateUtc(value: string): Date { const [y,m,d] = value.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }

@Injectable()
export class AcademicService {
  constructor(private readonly prisma: PrismaService) {}

  async catalogs(page = 1, pageSize = 50, search?: string) {
    const take = Math.min(Math.max(pageSize, 1), 100); const skip = (Math.max(page, 1) - 1) * take;
    const where = search ? { activa: true, nombre: { contains: search } } : { activa: true };
    const [instituciones, unidades, programas, cohortes, ti, tu, tp, tc] = await Promise.all([
      this.prisma.institucionAcademica.findMany({ where, orderBy: { nombre: "asc" }, skip, take }), this.prisma.unidadAcademica.findMany({ where: { ...where, institucion: { activa: true } }, orderBy: { nombre: "asc" }, skip, take }), this.prisma.programaAcademico.findMany({ where: { ...where, unidadAcademica: { activa: true, institucion: { activa: true } } }, orderBy: { nombre: "asc" }, skip, take }), this.prisma.cohorteAcademica.findMany({ where, orderBy: { nombre: "asc" }, skip, take }),
      this.prisma.institucionAcademica.count({ where }), this.prisma.unidadAcademica.count({ where: { ...where, institucion: { activa: true } } }), this.prisma.programaAcademico.count({ where: { ...where, unidadAcademica: { activa: true, institucion: { activa: true } } } }), this.prisma.cohorteAcademica.count({ where }),
    ]);
    return { page: Math.max(page, 1), pageSize: take, instituciones: { items: instituciones, total: ti }, unidades: { items: unidades, total: tu }, programas: { items: programas, total: tp }, cohortes: { items: cohortes, total: tc } };
  }

  async profile(userId: number, actor: AuthUser) {
    const user = await this.prisma.usuario.findUnique({ where: { id: userId }, select: { id: true, rol: true, sedeId: true, areaId: true, estado: true } });
    if (!user || user.estado !== EstadoUsuario.ACTIVA || actor.estado !== EstadoUsuario.ACTIVA) throw notFound("ACADEMIC_PROFILE_NOT_FOUND");
    const scope = getAccessScope(actor, Permission.ACADEMIC_PROFILE_READ);
    if (scope === AccessScope.SELF && actor.id !== userId) throw notFound("ACADEMIC_PROFILE_NOT_FOUND");
    if (scope === AccessScope.AREA && actor.areaId !== user.areaId) throw notFound("ACADEMIC_PROFILE_NOT_FOUND");
    if (scope === AccessScope.SEDE && actor.sedeId !== user.sedeId) throw notFound("ACADEMIC_PROFILE_NOT_FOUND");
    return this.prisma.adscripcionAcademica.findFirst({
      where: { usuarioId: userId, vigente: true, estado: "CONFIRMADA" }, orderBy: { inicio: "desc" },
      include: { institucion: true, unidadAcademica: true, programaAcademico: true, cohorte: true },
    });
  }

  async updateProfile(userId: number, input: ProfileInput, actorId: number) {
    if (input.fin && input.fin < input.inicio) throw invalidInput("ACADEMIC_INVALID_DATES");
    try { return await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM Usuario WHERE id = ${actorId} FOR UPDATE`;
      if (actorId !== userId) await tx.$executeRaw`SELECT id FROM Usuario WHERE id = ${userId} FOR UPDATE`;
      const actor = await tx.usuario.findUnique({ where: { id: actorId }, select: { estado: true } });
      if (!actor || actor.estado !== EstadoUsuario.ACTIVA) throw notFound("ACADEMIC_PROFILE_NOT_FOUND");
      const user = await tx.usuario.findUnique({ where: { id: userId }, select: { rol: true, estado: true } });
      if (!user) throw notFound("USER_NOT_FOUND");
      if (user.estado !== EstadoUsuario.ACTIVA) throw invalidInput("ACADEMIC_PROFILE_TARGET_INACTIVE");
      if (user.rol !== "PRESTADOR") throw invalidInput("ACADEMIC_PROFILE_ONLY_PRESTADOR");
      const [institution, program, unit, cohort] = await Promise.all([
        tx.institucionAcademica.findUnique({ where: { id: input.institucionId } }),
        tx.programaAcademico.findUnique({ where: { id: input.programaAcademicoId }, include: { unidadAcademica: true } }),
        input.unidadAcademicaId ? tx.unidadAcademica.findUnique({ where: { id: input.unidadAcademicaId } }) : Promise.resolve(null),
        input.cohorteId ? tx.cohorteAcademica.findUnique({ where: { id: input.cohorteId } }) : Promise.resolve(null),
      ]);
      if (!institution?.activa || !program?.activa || !program.unidadAcademica.activa || (input.unidadAcademicaId && !unit?.activa)) throw invalidInput("ACADEMIC_CATALOG_INACTIVE");
      if (program.unidadAcademica.institucionId !== institution.id || (unit && unit.id !== program.unidadAcademicaId)) throw invalidInput("ACADEMIC_CATALOG_MISMATCH");
      if (input.cohorteId && !cohort?.activa) throw invalidInput("ACADEMIC_COHORT_INACTIVE");
      const current = await tx.adscripcionAcademica.findFirst({ where: { usuarioId: userId, vigente: true, estado: "CONFIRMADA" }, orderBy: { inicio: "desc" } });
      if (current && (current.fin ? dateUtc(input.inicio) <= current.fin : dateUtc(input.inicio) <= current.inicio)) throw conflict("ACADEMIC_CHRONOLOGY_CONFLICT");
      const pending = await tx.adscripcionAcademica.findFirst({ where: { usuarioId: userId, estado: "PENDIENTE_CONFIRMACION" } });
      if (pending) throw conflict("ACADEMIC_PENDING_REQUEST_EXISTS");
      return tx.adscripcionAcademica.create({ data: { usuarioId: userId, institucionId: institution.id, unidadAcademicaId: input.unidadAcademicaId, programaAcademicoId: program.id, cohorteId: input.cohorteId, inicio: dateUtc(input.inicio), fin: input.fin ? dateUtc(input.fin) : null, solicitadoPorId: actorId, vigente: false, estado: "PENDIENTE_CONFIRMACION" }, include: { institucion: true, unidadAcademica: true, programaAcademico: true, cohorte: true } });
    }); } catch (error) { const code = (error as { code?: string }).code; if (code === "P2003" || code === "P2020") throw invalidInput("ACADEMIC_REFERENCE_INVALID"); if (code === "P2025") throw notFound("ACADEMIC_REQUEST_NOT_FOUND"); throw error; }
  }

  async confirm(id: number, actorId: number, accept: boolean, motivo?: string) {
    try { return await this.prisma.$transaction(async (tx) => {
      const actor = await tx.usuario.findUnique({ where: { id: actorId }, select: { estado: true, rol: true } });
      if (!actor || actor.estado !== EstadoUsuario.ACTIVA || !["ADMIN", "JEFE_COORDINADORES"].includes(actor.rol)) throw notFound("ACADEMIC_REQUEST_NOT_FOUND");
      const item = await tx.adscripcionAcademica.findUnique({ where: { id } });
      if (!item) throw notFound("ACADEMIC_REQUEST_NOT_FOUND");
      await tx.$executeRaw`SELECT id FROM Usuario WHERE id = ${item.usuarioId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM AdscripcionAcademica WHERE id = ${id} FOR UPDATE`;
      const locked = await tx.adscripcionAcademica.findUnique({ where: { id } });
      if (!locked || locked.estado !== "PENDIENTE_CONFIRMACION") throw conflict("ACADEMIC_REQUEST_ALREADY_RESOLVED");
      const target = await tx.usuario.findUnique({ where: { id: locked.usuarioId }, select: { estado: true, rol: true } });
      const refs = await tx.adscripcionAcademica.findUnique({ where: { id }, include: { institucion: true, unidadAcademica: { include: { institucion: true } }, programaAcademico: { include: { unidadAcademica: true } }, cohorte: true } });
      if (!target || target.estado !== EstadoUsuario.ACTIVA || target.rol !== "PRESTADOR" || !refs?.institucion.activa || !refs.programaAcademico.activa || !refs.programaAcademico.unidadAcademica.activa || (refs.unidadAcademica && !refs.unidadAcademica.activa) || (refs.cohorte && !refs.cohorte.activa)) throw conflict("ACADEMIC_REFERENCE_CHANGED");
      const current = await tx.adscripcionAcademica.findFirst({ where: { usuarioId: locked.usuarioId, vigente: true, estado: "CONFIRMADA" }, orderBy: { inicio: "desc" } });
      if (accept && current && (current.fin ? locked.inicio <= current.fin : locked.inicio <= current.inicio)) throw conflict("ACADEMIC_CHRONOLOGY_CONFLICT");
      if (accept) await tx.adscripcionAcademica.updateMany({ where: { usuarioId: locked.usuarioId, vigente: true, estado: "CONFIRMADA" }, data: { vigente: false, fin: locked.inicio } });
      return tx.adscripcionAcademica.update({ where: { id }, data: { estado: accept ? "CONFIRMADA" : "RECHAZADA", vigente: accept, confirmadoPorId: actorId, motivoRechazo: accept ? null : motivo ?? "Solicitud rechazada" } });
    }); } catch (error) { const code = (error as { code?: string }).code; if (code === "P2025") throw notFound("ACADEMIC_REQUEST_NOT_FOUND"); if (code === "P2003" || code === "P2020") throw invalidInput("ACADEMIC_REFERENCE_INVALID"); throw error; }
  }

  async pending(actor: AuthUser, page = 1, pageSize = 50) {
    if (actor.estado !== EstadoUsuario.ACTIVA) throw notFound("ACADEMIC_PROFILE_NOT_FOUND");
    const scope = getAccessScope(actor, Permission.ACADEMIC_PROFILE_READ); const take = Math.min(Math.max(pageSize, 1), 100); const skip = (Math.max(page, 1) - 1) * take;
    if (scope === AccessScope.SELF) return { items: [], page, pageSize: take, total: 0 };
    const where = { estado: "PENDIENTE_CONFIRMACION" as const, vigente: false, usuario: { estado: EstadoUsuario.ACTIVA, ...(scope === AccessScope.AREA ? { areaId: actor.areaId } : scope === AccessScope.SEDE ? { sedeId: actor.sedeId } : {}) } };
    const [items, total] = await Promise.all([this.prisma.adscripcionAcademica.findMany({ where, select: { id: true, usuarioId: true, institucion: true, programaAcademico: true, estado: true, vigente: true, inicio: true, fin: true, createdAt: true, usuario: { select: { id: true, codigo: true, email: true, rol: true, estado: true, sedeId: true, areaId: true } } }, skip, take, orderBy: { createdAt: "asc" } }), this.prisma.adscripcionAcademica.count({ where })]);
    return { items, page, pageSize: take, total };
  }

  async history(userId: number, actor: AuthUser, page = 1, pageSize = 50) {
    if (actor.estado !== EstadoUsuario.ACTIVA) throw notFound("ACADEMIC_PROFILE_NOT_FOUND");
    const target = await this.prisma.usuario.findUnique({ where: { id: userId }, select: { id: true, sedeId: true, areaId: true, estado: true } });
    if (!target) throw notFound("ACADEMIC_PROFILE_NOT_FOUND");
    const scope = getAccessScope(actor, Permission.ACADEMIC_PROFILE_READ); if (scope === AccessScope.SELF && actor.id !== userId || scope === AccessScope.AREA && actor.areaId !== target.areaId || scope === AccessScope.SEDE && actor.sedeId !== target.sedeId) throw notFound("ACADEMIC_PROFILE_NOT_FOUND");
    if (target.estado !== EstadoUsuario.ACTIVA && scope !== AccessScope.GLOBAL) throw notFound("ACADEMIC_PROFILE_NOT_FOUND");
    const take = Math.min(Math.max(pageSize, 1), 100); const skip = (Math.max(page, 1) - 1) * take;
    const where = { usuarioId: userId }; const [items, total] = await Promise.all([this.prisma.adscripcionAcademica.findMany({ where, include: { institucion: true, unidadAcademica: true, programaAcademico: true, cohorte: true }, skip, take, orderBy: { inicio: "desc" } }), this.prisma.adscripcionAcademica.count({ where })]); return { items, page, pageSize: take, total };
  }

  async createCatalog(kind: string, input: CatalogInput) {
    if (!["institucion", "unidad", "programa", "cohorte"].includes(kind)) throw invalidInput("ACADEMIC_CATALOG_KIND_INVALID");
    try {
      if (kind === "institucion" || kind === "cohorte") return kind === "institucion" ? this.prisma.institucionAcademica.create({ data: { nombre: input.nombre } }) : this.prisma.cohorteAcademica.create({ data: { nombre: input.nombre } });
      if (!input.parentId) throw invalidInput("ACADEMIC_PARENT_REQUIRED");
      const parentId = input.parentId;
      return this.prisma.$transaction(async (tx) => {
        if (kind === "unidad") { await tx.$executeRaw`SELECT id FROM InstitucionAcademica WHERE id = ${parentId} FOR UPDATE`; const p = await tx.institucionAcademica.findUnique({ where: { id: parentId } }); if (!p) throw notFound("ACADEMIC_PARENT_NOT_FOUND"); if (!p.activa) throw invalidInput("ACADEMIC_PARENT_INACTIVE"); return tx.unidadAcademica.create({ data: { nombre: input.nombre, institucionId: parentId } }); }
        await tx.$executeRaw`SELECT id FROM UnidadAcademica WHERE id = ${parentId} FOR UPDATE`; const p = await tx.unidadAcademica.findUnique({ where: { id: parentId } }); if (!p) throw notFound("ACADEMIC_PARENT_NOT_FOUND"); if (!p.activa) throw invalidInput("ACADEMIC_PARENT_INACTIVE"); return tx.programaAcademico.create({ data: { nombre: input.nombre, unidadAcademicaId: parentId } });
      });
    } catch (error) { const code = (error as { code?: string }).code; if (code === "P2002") throw conflict("ACADEMIC_CATALOG_ALREADY_EXISTS"); if (code === "P2003" || code === "P2020") throw invalidInput("ACADEMIC_REFERENCE_INVALID"); if (code === "P2025") throw notFound("ACADEMIC_PARENT_NOT_FOUND"); throw error; }
  }
}
