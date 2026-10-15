import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import {
  operationalNotification,
  type OperationalNotificationType,
  notificationContracts,
} from "../common/domain/operational-notification";
import type { z } from "zod";
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}
  list(userId: number, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (Math.max(page, 1) - 1) * take,
      take,
    });
  }
  read(userId: number, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }
  readAll(userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
  create<K extends OperationalNotificationType>(
    userId: number,
    type: K,
    payload: z.input<(typeof notificationContracts)[K]>,
    client?: any,
  ) {
    if (client) return operationalNotification(client, userId, type, payload);
    return this.prisma.$transaction((tx) =>
      operationalNotification(tx, userId, type, payload),
    );
  }
}
