import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { config } from "dotenv";
import { z } from "zod";

import { hashPassword } from "../auth/password";
import {
  activeAdminWhere,
  bootstrapAdmin,
  type BootstrapAdminRepository,
} from "../bootstrap/admin-bootstrap";
import { parseDatabaseUrl } from "../database/database-url";
import { PrismaClient } from "../generated/prisma/client";
import { EstadoUsuario, RolUsuario } from "../generated/prisma/enums";

config({ path: [".env", "../.env"], quiet: true });

const inputSchema = z.object({
  DATABASE_URL: z.url(),
  BOOTSTRAP_ADMIN_CODE: z.string().trim().min(1).max(50),
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(128),
});

class PrismaBootstrapAdminRepository implements BootstrapAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findActiveAdmin() {
    return this.prisma.usuario.findFirst({
      where: activeAdminWhere,
      select: { id: true },
    });
  }

  findByEmailOrCode(email: string, codigo: string) {
    return this.prisma.usuario.findFirst({
      where: { OR: [{ email }, { codigo }] },
      select: { id: true, email: true, codigo: true },
    });
  }

  create(input: { codigo: string; email: string; passwordHash: string }) {
    return this.prisma.usuario.create({
      data: {
        ...input,
        rol: RolUsuario.ADMIN,
        estado: EstadoUsuario.ACTIVO,
      },
      select: { id: true },
    });
  }

  recover(id: number, input: { passwordHash: string }) {
    return this.prisma.usuario.update({
      where: { id },
      data: {
        passwordHash: input.passwordHash,
        rol: RolUsuario.ADMIN,
        estado: EstadoUsuario.ACTIVO,
      },
      select: { id: true },
    });
  }
}

async function main(): Promise<void> {
  const environment = inputSchema.parse(process.env);
  const adapter = new PrismaMariaDb({
    ...parseDatabaseUrl(environment.DATABASE_URL),
    connectionLimit: 1,
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await bootstrapAdmin(
      new PrismaBootstrapAdminRepository(prisma),
      {
        codigo: environment.BOOTSTRAP_ADMIN_CODE,
        email: environment.BOOTSTRAP_ADMIN_EMAIL,
        password: environment.BOOTSTRAP_ADMIN_PASSWORD,
      },
      hashPassword,
    );
    console.info(`Admin bootstrap: ${result.status} (id=${result.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error("Admin bootstrap failed", error);
  process.exitCode = 1;
});
