import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database/prisma.service";

export function runtimeGrants(
  database: string,
  user: string,
  host: string,
  tables: string[],
) {
  if (
    !/^[A-Za-z0-9_]+$/.test(database) ||
    !/^ares_runtime[A-Za-z0-9_]*$/.test(user) ||
    !/^[A-Za-z0-9.%_-]+$/.test(host) ||
    tables.some((t) => !/^[A-Za-z0-9_]+$/.test(t))
  )
    throw new Error("Unsafe runtime grant identifiers");
  const appendOnly = new Set([
    "movimientoinventario",
    "operationalhistory",
    "auditevent",
    "formalizacionexpediente",
    "eventoperiodoservicio",
    "objectdeletionacknowledgement",
  ]);
  return tables
    .filter((t) => t.toLowerCase() !== "_prisma_migrations")
    .map(
      (table) =>
        `GRANT ${appendOnly.has(table.toLowerCase()) ? "SELECT, INSERT" : ["objectdeletionjob", "orphanobjectdeletion"].includes(table.toLowerCase()) ? "SELECT, INSERT, UPDATE" : "SELECT, INSERT, UPDATE, DELETE"} ON \`${database}\`.\`${table}\` TO '${user}'@'${host}'`,
    );
}

async function main() {
  if (!process.argv.includes("--apply"))
    throw new Error(
      "Explicit --apply required; provision only a reviewed, dedicated runtime account",
    );
  const url = process.env.DB_ADMIN_URL;
  const user = process.env.RUNTIME_DB_USER ?? "ares_runtime";
  const host = process.env.RUNTIME_DB_HOST ?? "%";
  const password = process.env.RUNTIME_DB_PASSWORD ?? "";
  if (!url || !/^[A-Za-z0-9_-]{32,128}$/.test(password))
    throw new Error(
      "DB_ADMIN_URL and a 32-128 character base64url RUNTIME_DB_PASSWORD are required",
    );
  const database = new URL(url).pathname.slice(1);
  runtimeGrants(database, user, host, []);
  const db = new PrismaService(new ConfigService({ DATABASE_URL: url }));
  try {
    const tables = await db.$queryRaw<
      { TABLE_NAME: string }[]
    >`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ${database} AND TABLE_TYPE = 'BASE TABLE'`;
    const grants = runtimeGrants(
      database,
      user,
      host,
      tables.map((t) => t.TABLE_NAME),
    );
    if (
      !tables.some((t) => t.TABLE_NAME.toLowerCase() === "movimientoinventario")
    )
      throw new Error("Migrations must be applied before runtime provisioning");
    // Owns only explicitly named ares_runtime* accounts. Reapply after every
    // migration. No schema-wide grants, DDL, or GRANT OPTION for the runtime.
    await db.$executeRawUnsafe(
      `CREATE USER IF NOT EXISTS '${user}'@'${host}' IDENTIFIED BY '${password}'`,
    );
    await db.$executeRawUnsafe(
      `ALTER USER '${user}'@'${host}' IDENTIFIED BY '${password}'`,
    );
    await db.$executeRawUnsafe(
      `REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${user}'@'${host}'`,
    );
    for (const grant of grants) await db.$executeRawUnsafe(grant);
    console.log(
      "Dedicated runtime privileges provisioned; append-only ledger permissions enforced.",
    );
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module)
  void main().catch(() => {
    console.error("Runtime DB provisioning failed. No credentials are logged.");
    process.exitCode = 1;
  });
