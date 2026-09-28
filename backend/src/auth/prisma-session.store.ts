import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import session from "express-session";

import { PrismaService } from "../database/prisma.service";

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;
const IDLE_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const TOUCH_THROTTLE_MS = 60 * 1000;

@Injectable()
export class PrismaSessionStore
  extends session.Store
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaSessionStore.name);
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override get(
    sid: string,
    callback: (error: unknown, session?: session.SessionData | null) => void,
  ): void {
    void this.prisma.session
      .findUnique({ where: { id: sid } })
      .then(async (stored) => {
        if (!stored) {
          callback(null, null);
          return;
        }

        const now = new Date();
        if (stored.revokedAt || stored.expiresAt <= now || (stored.absoluteExpiresAt && stored.absoluteExpiresAt <= now) || (stored.lastActivityAt && stored.lastActivityAt.getTime() + IDLE_TTL_MS <= now.getTime())) {
          await this.prisma.session.deleteMany({ where: { id: sid } });
          callback(null, null);
          return;
        }

        callback(null, cloneSession(stored.data));
      })
      .catch(callback);
  }

  override set(
    sid: string,
    value: session.SessionData,
    callback?: (error?: unknown) => void,
  ): void {
    const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + DEFAULT_TTL_MS);
    const expiresAt = new Date(Math.min(getExpiration(value).getTime(), absoluteExpiresAt.getTime()));
    const userId = typeof value.userId === "number" ? value.userId : undefined;

    void this.prisma.session
      .upsert({
        where: { id: sid },
        create: { id: sid, data: cloneJson(value), expiresAt, absoluteExpiresAt, lastActivityAt: now, userId },
        update: { data: cloneJson(value), expiresAt, lastActivityAt: now, userId },
      })
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override destroy(sid: string, callback?: (error?: unknown) => void): void {
    void this.prisma.session
      .deleteMany({ where: { id: sid } })
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override touch(
    sid: string,
    value: session.SessionData,
    callback?: (error?: unknown) => void,
  ): void {
    void this.prisma.session.findUnique({ where: { id: sid }, select: { lastActivityAt: true, absoluteExpiresAt: true, revokedAt: true } })
      .then((stored) => {
        if (!stored || stored.revokedAt) return;
        const now = Date.now();
        if (stored.lastActivityAt && stored.lastActivityAt.getTime() + TOUCH_THROTTLE_MS > now) return;
        const expiresAt = new Date(Math.min(getExpiration(value).getTime(), now + IDLE_TTL_MS, stored.absoluteExpiresAt?.getTime() ?? Number.POSITIVE_INFINITY));
        return this.prisma.session.updateMany({ where: { id: sid, revokedAt: null }, data: { expiresAt, lastActivityAt: new Date(now) } });
      })
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  onApplicationBootstrap(): void {
    void this.cleanupExpiredSessions();
    this.cleanupTimer = setInterval(
      () => void this.cleanupExpiredSessions(),
      CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async deleteExpiredSessions(now = new Date()): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    return result.count;
  }

  private async cleanupExpiredSessions(): Promise<void> {
    try {
      const deleted = await this.deleteExpiredSessions();
      if (deleted > 0) {
        this.logger.log(`Deleted ${deleted} expired sessions`);
      }
    } catch (error) {
      this.logger.error("Failed to delete expired sessions", error);
    }
  }
}

function getExpiration(value: session.SessionData): Date {
  if (value.cookie.expires) {
    return new Date(value.cookie.expires);
  }

  return new Date(Date.now() + (value.cookie.maxAge ?? DEFAULT_TTL_MS));
}

function cloneJson(value: session.SessionData) {
  return JSON.parse(JSON.stringify(value)) as object;
}

function cloneSession(value: unknown): session.SessionData {
  return JSON.parse(JSON.stringify(value)) as session.SessionData;
}
