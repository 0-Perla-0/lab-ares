import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseTls } from "../../../src/database/database-tls";
import { parseDatabaseUrl } from "../../../src/database/database-url";
import {
  parsePasswordCorpus,
  passwordDenyHashes,
} from "../../../src/auth/password-denylist";
import { validatePasswordPolicy } from "../../../src/auth/password";
import { operationalNotification } from "../../../src/common/domain/operational-notification";
import { validateEnvironment } from "../../../src/config/environment";

afterEach(() => vi.unstubAllEnvs());
describe("completion security contracts", () => {
  it("uses verified TLS 1.2+ and never treats false environment strings as enabled", () => {
    expect(databaseTls({ enabled: "false" })).toBeUndefined();
    expect(
      databaseTls({ enabled: true, servername: "db.example.test" }),
    ).toMatchObject({
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
      servername: "db.example.test",
    });
    expect(() => databaseTls({ enabled: "invalid" })).toThrow();
    expect(() => databaseTls({ enabled: false, ca: "invalid" })).toThrow();
    expect(() => databaseTls({ enabled: true, ca: "invalid" })).toThrow();
  });
  it("rejects ignored database URL TLS options rather than connecting in plaintext", () => {
    expect(() =>
      parseDatabaseUrl("mysql://ares:secret@localhost/ares_test?ssl=true"),
    ).toThrow("query options are unsupported");
  });
  it("validates paired corpus and TLS configuration", () => {
    const env = { DATABASE_URL: "mysql://ares:secret@localhost/ares_test" };
    expect(() =>
      validateEnvironment({ ...env, PASSWORD_DENY_FILE: "/corpus" }),
    ).toThrow();
    expect(() =>
      validateEnvironment({
        ...env,
        DATABASE_TLS_SERVERNAME: "db.example.test",
      }),
    ).toThrow();
    expect(
      validateEnvironment({ ...env, DATABASE_TLS_SERVERNAME: "" })
        .DATABASE_TLS_ENABLED,
    ).toBe(false);
  });
  it("accepts only hash lines, deduplicates and rejects plaintext corpora", () => {
    const hash = "a".repeat(64);
    expect(parsePasswordCorpus(`${hash}\r\n${hash.toUpperCase()}\n`).size).toBe(
      1,
    );
    expect(() => parsePasswordCorpus("leaked-plaintext-password")).toThrow();
    expect(() => parsePasswordCorpus("")).toThrow();
  });
  it("accepts explicit browser-reachable signing endpoints and fails closed for unsafe URLs", () => {
    const env = { DATABASE_URL: "mysql://ares:secret@localhost/ares_test" };
    expect(
      validateEnvironment({ ...env, S3_DOWNLOAD_ENDPOINT: "" })
        .S3_DOWNLOAD_ENDPOINT,
    ).toBeUndefined();
    expect(
      validateEnvironment({
        ...env,
        S3_DOWNLOAD_ENDPOINT: "http://localhost:9000",
      }).S3_DOWNLOAD_ENDPOINT,
    ).toBe("http://localhost:9000");
    for (const endpoint of [
      "ftp://files.example.test",
      "https://secret@files.example.test",
      "https://files.example.test?token=secret",
      "https://files.example.test#fragment",
    ])
      expect(() =>
        validateEnvironment({ ...env, S3_DOWNLOAD_ENDPOINT: endpoint }),
      ).toThrow();
    const production = {
      ...env,
      NODE_ENV: "production",
      SMTP_ENABLED: false,
      SESSION_SECRET: "unit-only-session-secret-not-for-deployment-2026",
      MFA_ENCRYPTION_KEY: "unit-only-factor-secret-not-for-deployment-2026",
      OUTBOX_ENCRYPTION_KEY: "unit-only-outbox-secret-not-for-deployment-2026",
      SUPPRESSION_JOURNAL_HMAC_SECRET:
        "unit-only-journal-secret-not-for-deployment-2026",
    };
    expect(() =>
      validateEnvironment({
        ...production,
        S3_DOWNLOAD_ENDPOINT: "http://files.example.test",
      }),
    ).toThrow();
    expect(
      validateEnvironment({
        ...production,
        S3_DOWNLOAD_ENDPOINT: "https://files.example.test",
      }).S3_DOWNLOAD_ENDPOINT,
    ).toBe("https://files.example.test");
  });
  it("caches immutable hash lookups and rejects configured compromised passwords", async () => {
    const password = "Una frase comprometida de prueba";
    vi.stubEnv(
      "PASSWORD_DENY_SHA256",
      createHash("sha256").update(password).digest("hex"),
    );
    vi.stubEnv("PASSWORD_DENY_FILE", "");
    vi.stubEnv("PASSWORD_DENY_FILE_SHA256", "");
    expect(passwordDenyHashes()).toBe(passwordDenyHashes());
    await expect(
      Promise.resolve().then(() => validatePasswordPolicy(password)),
    ).rejects.toMatchObject({ code: "PASSWORD_BLOCKED" });
  });
  it("rejects a corpus lacking approved checksum before reading any file", () => {
    vi.stubEnv("PASSWORD_DENY_FILE", "/unapproved/corpus");
    vi.stubEnv("PASSWORD_DENY_FILE_SHA256", "");
    expect(() => passwordDenyHashes()).toThrow("approved checksum");
  });
  it("rejects private payload fields before writing either transactional record", async () => {
    const tx: any = {
      notification: { create: vi.fn() },
      outboxEvent: { create: vi.fn() },
    };
    await expect(
      operationalNotification(tx, 1, "MFA_ENABLED", {
        enabled: true,
        token: "secret",
      } as any),
    ).rejects.toThrow();
    await expect(
      operationalNotification(tx, 1, "ABSENCE_RESOLVED", {
        ausenciaId: "test",
        estado: "JUSTIFICADA",
        motivo: "private",
      } as any),
    ).rejects.toThrow();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });
});
