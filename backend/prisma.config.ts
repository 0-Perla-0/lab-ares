import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

import { parseDatabaseUrl } from "./src/database/database-url";

dotenv.config({ path: [".env", "../.env"] });

const databaseUrl = env("DATABASE_URL");
parseDatabaseUrl(databaseUrl);

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
  },

  datasource: {
    url: databaseUrl,
  },
});
