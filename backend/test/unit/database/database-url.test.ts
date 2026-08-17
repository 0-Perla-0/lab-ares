import { describe, expect, it } from "vitest";

import { parseDatabaseUrl } from "../../../src/database/database-url";

describe("parseDatabaseUrl", () => {
  it("parses a MySQL connection URL and applies the default port", () => {
    expect(
      parseDatabaseUrl("mysql://ares:p%40ss@db.internal/ares_dev"),
    ).toEqual({
      host: "db.internal",
      port: 3306,
      user: "ares",
      password: "p@ss",
      database: "ares_dev",
    });
  });

  it("accepts MariaDB URLs with a custom port", () => {
    expect(
      parseDatabaseUrl("mariadb://ares:secret@localhost:3307/ares_test"),
    ).toMatchObject({
      port: 3307,
      database: "ares_test",
    });
  });

  it("rejects missing connection configuration", () => {
    expect(() => parseDatabaseUrl(undefined)).toThrow(
      "DATABASE_URL is not defined",
    );
  });

  it("rejects unsupported protocols", () => {
    expect(() =>
      parseDatabaseUrl("postgresql://ares:secret@localhost/ares"),
    ).toThrow("DATABASE_URL must use the mysql or mariadb protocol");
  });

  it("rejects incomplete URLs", () => {
    expect(() => parseDatabaseUrl("mysql://localhost")).toThrow(
      "DATABASE_URL must include a host, username, and database name",
    );
  });

  it.each([
    "mysql://ares_app:CHANGE_ME@localhost:3306/ares_dev",
    "mysql://user:password@localhost:3306/ares_dev",
  ])("rejects example credentials in %s", (databaseUrl) => {
    expect(() => parseDatabaseUrl(databaseUrl)).toThrow(
      "DATABASE_URL uses example credentials",
    );
  });
});
