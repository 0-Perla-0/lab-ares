import { DATABASE_URL } from "astro:env/server";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../generated/prisma/client";

import { parseDatabaseUrl } from "./database-url";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let prisma: PrismaClient | undefined;

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaMariaDb({
    ...parseDatabaseUrl(DATABASE_URL),
    connectionLimit: 5,
  });

  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  prisma ??= globalForPrisma.prisma ?? createPrismaClient();

  if (import.meta.env.DEV) {
    globalForPrisma.prisma = prisma;
  }

  return prisma;
}
