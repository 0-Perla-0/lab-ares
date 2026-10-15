import { ConfigService } from "@nestjs/config";
import { config } from "dotenv";
import type session from "express-session";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaSessionStore } from "../../src/auth/prisma-session.store";
import { UniqueConstraintError } from "../../src/common/errors/unique-constraint-error";
import { PrismaService } from "../../src/database/prisma.service";
import { SedeRepository } from "../../src/organization/repositories/sede.repository";

config({ path: [".env", "../.env"], quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/_(test|ci)$/.test(new URL(databaseUrl).pathname)) {
  throw new Error(
    "Database integration requires a dedicated DATABASE_URL ending in _test or _ci",
  );
}

const sessionId = `phase0-integration-session-${process.pid}`;
const sedeName = `phase0-integration-sede-${process.pid}-${Date.now()}`;
const prisma = new PrismaService(
  new ConfigService({ DATABASE_URL: databaseUrl }),
);
let sessionUserId: number;
const sessions = new PrismaSessionStore(prisma);
const sedes = new SedeRepository(prisma);

describe("MariaDB integration", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
    const user = await prisma.usuario.create({
      data: {
        codigo: sedeName,
        email: `${sedeName}@example.test`,
        passwordHash: "non-login-synthetic-fixture",
        estado: "ACTIVA",
      },
    });
    sessionUserId = user.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { id: sessionId } });
    if (sessionUserId)
      await prisma.usuario.delete({ where: { id: sessionUserId } });
    await prisma.sede.deleteMany({ where: { nombre: sedeName } });
    await prisma.$disconnect();
  });

  it("persists sessions through the real Prisma store", async () => {
    const value = createSession();
    await setSession(sessionId, value);

    await expect(getSession(sessionId)).resolves.toMatchObject({
      userId: sessionUserId,
    });
    await destroySession(sessionId);
    await expect(getSession(sessionId)).resolves.toBeNull();
  });

  it("translates a real unique-index violation", async () => {
    await sedes.create({ nombre: sedeName, direccion: null });

    await expect(
      sedes.create({ nombre: sedeName, direccion: null }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);
  });
});

function createSession(): session.SessionData {
  return {
    cookie: {
      originalMaxAge: 60_000,
      expires: new Date(Date.now() + 60_000),
      httpOnly: true,
      path: "/",
    },
    userId: sessionUserId,
  };
}

function setSession(id: string, value: session.SessionData): Promise<void> {
  return new Promise((resolve, reject) => {
    sessions.set(id, value, (error) => (error ? reject(error) : resolve()));
  });
}

function getSession(id: string): Promise<session.SessionData | null> {
  return new Promise((resolve, reject) => {
    sessions.get(id, (error, value) =>
      error ? reject(error) : resolve(value ?? null),
    );
  });
}

function destroySession(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sessions.destroy(id, (error) => (error ? reject(error) : resolve()));
  });
}
