import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
@Injectable() export class NotificationsService {
 constructor(private readonly prisma: PrismaService) {}
 list(userId:number, page=1, limit=20){ const take=Math.min(Math.max(limit,1),100); return this.prisma.notification.findMany({where:{userId},orderBy:{createdAt:"desc"},skip:(Math.max(page,1)-1)*take,take}); }
 read(userId:number,id:string){ return this.prisma.notification.updateMany({where:{id,userId},data:{readAt:new Date()}}); }
 readAll(userId:number){ return this.prisma.notification.updateMany({where:{userId,readAt:null},data:{readAt:new Date()}}); }
 create(userId:number,type:string,payload:Record<string,unknown>,client:any=this.prisma){ return client.notification.create({data:{userId,type,payload}}); }
}
