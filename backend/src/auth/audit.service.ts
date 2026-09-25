import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export interface AuditInput { actorId?: number; subjectId?: number; action: string; resource: string; correlationId?: string; metadata?: Record<string, unknown>; }

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  append(input: AuditInput, client: any = this.prisma) {
    return client.auditEvent.create({ data: { actorId: input.actorId, subjectId: input.subjectId, action: input.action, resource: input.resource, correlationId: input.correlationId, metadata: input.metadata } });
  }
}
