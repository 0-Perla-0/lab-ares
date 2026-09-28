import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../auth/audit.service";
import { ApiException } from "../common/errors/api.exception";
import { EstadoProyectoKairos, EstadoUsuario } from "../generated/prisma/enums";
import type { AuthUser } from "../auth/auth-user";
import type { DirectoryQuery } from "./directory.schemas";
import type { Prisma } from "../generated/prisma/client";

@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  private async pref(client: PrismaService | Prisma.TransactionClient, id:number) { return client.directorioPreferencia.upsert({where:{usuarioId:id},create:{usuarioId:id},update:{},select:{visibleEnArea:true,visibleEnProyectos:true,mostrarEmail:true}}); }
  async list(actor: AuthUser, input: DirectoryQuery) {
    if (input.scope === "all" && actor.rol !== "ADMIN" && !["JEFE_COORDINADORES"].includes(actor.rol)) throw new ApiException("FORBIDDEN",403);
    if (input.scope === "area" && (actor.areaId === null || actor.sedeId === null)) return {items:[],page:input.page,pageSize:input.pageSize,total:0};
    return this.prisma.$transaction(async tx => {
      const p = await this.pref(tx, actor.id);
      const projectId = input.projectId;
      if (input.scope === "project") {
        await tx.$executeRaw`SELECT id FROM ProyectoKairos WHERE id=${projectId!} FOR UPDATE`;
        await tx.$executeRaw`SELECT proyectoId,usuarioId FROM MiembroProyectoKairos WHERE proyectoId=${projectId!} AND usuarioId=${actor.id} FOR UPDATE`;
        const project = await tx.proyectoKairos.findFirst({where:{id:projectId!,estado:{in:[EstadoProyectoKairos.ACTIVO,EstadoProyectoKairos.ARCHIVADO]}},select:{id:true}});
        const membership = await tx.miembroProyectoKairos.findFirst({where:{proyectoId:projectId!,usuarioId:actor.id,removedAt:null},select:{usuarioId:true}});
        if (!project || !membership) throw new ApiException("FORBIDDEN",403);
      }
      const q = input.q?.trim();
      const where: Prisma.UsuarioWhereInput = {estado:EstadoUsuario.ACTIVA};
      if (input.scope === "area") { where.sedeId=actor.sedeId!; where.areaId=actor.areaId!; where.OR=[{id:actor.id},{directorioPreferencia:{visibleEnArea:true}}]; }
      if (input.scope === "project") { where.kairosMemberships={some:{proyectoId: projectId!,removedAt:null}}; where.OR=[{id:actor.id},{directorioPreferencia:{visibleEnProyectos:true}}]; }
      if (input.scope === "all") { /* global directory ignores area/project visibility flags */ }
      if (q) where.AND=[{OR:[{codigo:{contains:q}},{AND:[{email:{contains:q}},{OR:[{id:actor.id},{directorioPreferencia:{mostrarEmail:true}}]}]}]}];
      const [total, rows] = await Promise.all([tx.usuario.count({where}),tx.usuario.findMany({where,orderBy:[{codigo:"asc"},{id:"asc"}],skip:(input.page-1)*input.pageSize,take:input.pageSize,select:{id:true,codigo:true,email:true,rol:true,sede:{select:{id:true,nombre:true}},area:{select:{id:true,nombre:true}},turno:{select:{id:true,nombre:true}},directorioPreferencia:{select:{mostrarEmail:true}}}})]);
      return {items:rows.map(r=>({id:r.id,codigo:r.codigo,email:r.id===actor.id||r.directorioPreferencia?.mostrarEmail?r.email:undefined,rol:r.rol,sede:r.sede,area:r.area,turno:r.turno})),page:input.page,pageSize:input.pageSize,total};
    });
  }
  async getPreferences(actor:AuthUser){ return this.pref(this.prisma,actor.id); }
  async updatePreferences(actor:AuthUser, data:any){ return this.prisma.$transaction(async tx=>{ const result=await tx.directorioPreferencia.upsert({where:{usuarioId:actor.id},create:{usuarioId:actor.id,...data},update:data,select:{visibleEnArea:true,visibleEnProyectos:true,mostrarEmail:true}}); await this.audit.append({actorId:actor.id,subjectId:actor.id,action:"DIRECTORY_PREFERENCES_UPDATED",resource:"directory",metadata:data},tx); return result; }); }
}
