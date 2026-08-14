export type DatabaseConnectionOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

const SUPPORTED_PROTOCOLS = new Set(["mysql:", "mariadb:"]);
const LEGACY_EXAMPLE_USER = "user";
const LEGACY_EXAMPLE_PASSWORD = "password";
const EXAMPLE_PASSWORD = "CHANGE_ME";

export function parseDatabaseUrl(
  databaseUrl: string | undefined,
): DatabaseConnectionOptions {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined");
  }

  let url: URL;

  try {
    url = new URL(databaseUrl);
  } catch (error) {
    throw new Error("DATABASE_URL must be a valid connection URL", {
      cause: error,
    });
  }

  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
    throw new Error("DATABASE_URL must use the mysql or mariadb protocol");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

  if (!url.hostname || !url.username || !database) {
    throw new Error(
      "DATABASE_URL must include a host, username, and database name",
    );
  }

  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  if (
    password === EXAMPLE_PASSWORD ||
    (user === LEGACY_EXAMPLE_USER && password === LEGACY_EXAMPLE_PASSWORD)
  ) {
    throw new Error(
      "DATABASE_URL uses example credentials; replace them with a real password-authenticated MariaDB user",
    );
  }

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user,
    password,
    database,
  };
}
