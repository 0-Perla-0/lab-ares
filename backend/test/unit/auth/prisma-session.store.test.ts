import type session from "express-session";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaSessionStore } from "../../../src/auth/prisma-session.store";
import type { PrismaService } from "../../../src/database/prisma.service";

const sessions = {
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  updateMany: vi.fn(),
};
const store = new PrismaSessionStore({
  session: sessions,
} as unknown as PrismaService);

describe("PrismaSessionStore", () => {
  beforeEach(() => vi.resetAllMocks());

  it("persists a serializable session and its expiration", async () => {
    sessions.upsert.mockResolvedValue({});
    const value = createSession();

    await setSession("sid", value);

    expect(sessions.upsert).toHaveBeenCalledWith({
      where: { id: "sid" },
      create: {
        id: "sid",
        data: expect.objectContaining({ userId: 7 }),
        expiresAt: new Date("2026-01-01T08:00:00.000Z"),
      },
      update: {
        data: expect.objectContaining({ userId: 7 }),
        expiresAt: new Date("2026-01-01T08:00:00.000Z"),
      },
    });
  });

  it("returns a stored active session", async () => {
    const value = createSession();
    sessions.findUnique.mockResolvedValue({
      data: value,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(getSession("sid")).resolves.toMatchObject({ userId: 7 });
  });

  it("deletes and hides an expired session", async () => {
    sessions.findUnique.mockResolvedValue({
      data: createSession(),
      expiresAt: new Date(Date.now() - 60_000),
    });
    sessions.deleteMany.mockResolvedValue({ count: 1 });

    await expect(getSession("sid")).resolves.toBeNull();
    expect(sessions.deleteMany).toHaveBeenCalledWith({ where: { id: "sid" } });
  });

  it("returns null for an unknown session", async () => {
    sessions.findUnique.mockResolvedValue(null);
    await expect(getSession("missing")).resolves.toBeNull();
  });

  it("deletes all sessions that have expired", async () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    sessions.deleteMany.mockResolvedValue({ count: 3 });

    await expect(store.deleteExpiredSessions(now)).resolves.toBe(3);
    expect(sessions.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: now } },
    });
  });

  function createSession(): session.SessionData {
    return {
      cookie: {
        originalMaxAge: 28_800_000,
        expires: new Date("2026-01-01T08:00:00.000Z"),
        httpOnly: true,
        path: "/",
      },
      userId: 7,
    };
  }

  function setSession(id: string, value: session.SessionData): Promise<void> {
    return new Promise((resolve, reject) => {
      store.set(id, value, (error) => (error ? reject(error) : resolve()));
    });
  }

  function getSession(id: string): Promise<session.SessionData | null> {
    return new Promise((resolve, reject) => {
      store.get(id, (error, value) =>
        error ? reject(error) : resolve(value ?? null),
      );
    });
  }
});
