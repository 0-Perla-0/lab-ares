import { Injectable } from "@nestjs/common";
import session from "express-session";

import { PrismaService } from "../database/prisma.service";

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class PrismaSessionStore extends session.Store {
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

        if (stored.expiresAt <= new Date()) {
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
    const expiresAt = getExpiration(value);

    void this.prisma.session
      .upsert({
        where: { id: sid },
        create: { id: sid, data: cloneJson(value), expiresAt },
        update: { data: cloneJson(value), expiresAt },
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
    void this.prisma.session
      .updateMany({
        where: { id: sid },
        data: { expiresAt: getExpiration(value) },
      })
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
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
