import { z } from "zod";
import { parseVisitKeyring } from "../visits/visit-token";
import { validCidr } from "../attendance/attendance-signals";
import { parseQueueSlos } from "../operations/queue-monitor.worker";
import { parseDeletionKeyring } from "../storage/deletion-keyring";

export const DEVELOPMENT_SESSION_SECRET =
  "development-only-session-secret-change-me";
const DOCUMENTED_SESSION_SECRET_PLACEHOLDER =
  "replace-this-with-at-least-32-random-characters";
const insecureProductionSecrets = new Set([
  DEVELOPMENT_SESSION_SECRET,
  DOCUMENTED_SESSION_SECRET_PLACEHOLDER,
]);
const insecureKeyMarkers = [
  "development-only",
  "change-me",
  "replace-this",
  "test-outbox-encryption-key",
];

function hasSecureEntropy(value: string) {
  if (insecureKeyMarkers.some((marker) => value.toLowerCase().includes(marker)))
    return false;
  // Accept either a raw 32-byte secret or a base64/base64url encoding of at least 32 bytes.
  if (Buffer.byteLength(value, "utf8") >= 32) return true;
  try {
    return Buffer.from(value, "base64url").length >= 32;
  } catch {
    return false;
  }
}

const timeZone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "APP_TIME_ZONE must be a valid IANA time zone");

const environmentBoolean = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((value) => value === true || value === "true" || value === "1");

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.url(),
    DATABASE_TLS_ENABLED: environmentBoolean.default(false),
    DATABASE_TLS_CA: z.string().optional(),
    DATABASE_TLS_SERVERNAME: z
      .string()
      .regex(/^[A-Za-z0-9.-]+$/)
      .optional()
      .or(z.literal(""))
      .transform((v) => v || undefined),
    BACKEND_HOST: z.string().min(1).default("0.0.0.0"),
    BACKEND_PORT: z.coerce.number().int().positive().max(65535).default(3000),
    OPERATIONS_QUEUE_MONITOR_ENABLED: environmentBoolean.default(false),
    OPERATIONS_QUEUE_MONITOR_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(10000)
      .default(60000),
    OPERATIONS_QUEUE_SLO_JSON: z
      .string()
      .default("{}")
      .refine((value) => {
        try {
          parseQueueSlos(value);
          return true;
        } catch {
          return false;
        }
      }, "Invalid reviewed queue SLO configuration"),
    FRONTEND_ORIGIN: z.url().default("http://localhost:4321"),
    TRUSTED_PROXY_CIDRS: z
      .string()
      .default("")
      .refine(
        (v) => !v || v.split(",").every((s) => validCidr(s.trim())),
        "Trusted proxies must be explicit CIDRs",
      ),
    VISITS_ENABLED: environmentBoolean.default(false),
    INVENTORY_ENABLED: environmentBoolean.default(false),
    VISITS_TOKEN_ACTIVE_VERSION: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,32}$/)
      .default("legacy"),
    VISITS_TOKEN_KEYRING: z
      .string()
      .default("")
      .refine((value) => {
        try {
          if (value) parseVisitKeyring(value);
          return true;
        } catch {
          return false;
        }
      }, "Invalid visit keyring JSON"),
    INVENTORY_CHECK_WORKER_ENABLED: environmentBoolean.default(false),
    INVENTORY_CHECK_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(10000)
      .default(300000),
    OPERATIONAL_PILOT_SEDE_IDS: z
      .string()
      .default("")
      .refine(
        (v) => !v || v.split(",").every((n) => /^[1-9]\d*$/.test(n.trim())),
        "Invalid pilot sede ids",
      ),
    OPERATIONAL_PILOT_AREA_IDS: z
      .string()
      .default("")
      .refine(
        (v) => !v || v.split(",").every((n) => /^[1-9]\d*$/.test(n.trim())),
        "Invalid pilot area ids",
      ),
    VISITS_TOKEN_KEY: z
      .string()
      .min(32)
      .default("development-only-visits-token-key-change-me"),
    APP_TIME_ZONE: timeZone.default("America/Mexico_City"),
    ATTENDANCE_ALERT_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    SESSION_SECRET: z.string().min(32).default(DEVELOPMENT_SESSION_SECRET),
    PASSWORD_DENY_SHA256: z
      .string()
      .regex(/^(?:[a-fA-F0-9]{64}(?:,[a-fA-F0-9]{64})*)?$/)
      .default(""),
    PASSWORD_DENY_FILE: z.string().optional(),
    PASSWORD_DENY_FILE_SHA256: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .optional(),
    OUTBOX_ENCRYPTION_KEY: z
      .string()
      .min(32)
      .default("development-only-outbox-key-change-me-32chars"),
    MFA_ENCRYPTION_KEY: z
      .string()
      .min(32)
      .default("development-only-mfa-key-change-me-32chars"),
    S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
    OBJECT_DELETION_HMAC_KEYRING: z
      .string()
      .default("")
      .superRefine((value, ctx) => {
        try {
          parseDeletionKeyring(value);
        } catch {
          ctx.addIssue({
            code: "custom",
            message:
              "Deletion verification keyring must map key versions to secrets of at least 32 characters",
          });
        }
      }),
    S3_DOWNLOAD_ENDPOINT: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .string()
        .url()
        .refine((value) => {
          const endpoint = new URL(value);
          return (
            ["http:", "https:"].includes(endpoint.protocol) &&
            !endpoint.username &&
            !endpoint.password &&
            !endpoint.search &&
            !endpoint.hash
          );
        }, "Download endpoint must be HTTP(S) without credentials/query/fragment")
        .optional(),
    ),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_ACCESS_KEY: z.string().min(1).default("ares-local"),
    S3_SECRET_KEY: z.string().min(1).default("ares-local-secret"),
    S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
    S3_QUARANTINE_BUCKET: z.string().min(1).default("ares-quarantine"),
    S3_AVAILABLE_BUCKET: z.string().min(1).default("ares-available"),
    S3_PUBLIC_BUCKET: z.string().min(1).default("ares-public"),
    S3_SUPPRESSION_JOURNAL_BUCKET: z
      .string()
      .min(1)
      .default("ares-suppression-journal"),
    SUPPRESSION_JOURNAL_HMAC_SECRET: z
      .string()
      .min(32)
      .default("development-only-journal-key-change-me-32chars"),
    SUPPRESSION_JOURNAL_KEY_VERSION: z.string().min(1).max(50).default("v1"),
    SUPPRESSION_JOURNAL_WORKER_ENABLED: z
      .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
      .transform((value) => value === true || value === "true" || value === "1")
      .default(false),
    SUPPRESSION_JOURNAL_WORKER_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .default(60000),
    RECOVERY_RECONCILIATION_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(3),
    RECOVERY_RECONCILIATION_LEASE_MS: z.coerce
      .number()
      .int()
      .min(10000)
      .default(120000),
    STORAGE_MAX_BYTES: z.coerce.number().int().positive().default(52428800),
    STORAGE_MAX_CONCURRENT_UPLOADS: z.coerce
      .number()
      .int()
      .min(1)
      .max(32)
      .default(4),
    LIBRARY_MAX_BYTES: z.coerce.number().int().positive().default(26214400),
    GAMIFICATION_ENABLED: z
      .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
      .transform((value) => value === true || value === "true" || value === "1")
      .default(false),
    GAMIFICATION_POINTS_PER_LEVEL: z.coerce.number().int().min(1).default(100),
    PRINTING_3D_ENABLED: z
      .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
      .transform((value) => value === true || value === "true" || value === "1")
      .default(false),
    RETENTION_INSTITUTIONAL_POLICIES_APPROVED: z
      .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
      .transform((value) => value === true || value === "true" || value === "1")
      .default(false),
    RETENTION_WORKER_ENABLED: z
      .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
      .transform((value) => value === true || value === "true" || value === "1")
      .default(false),
    RETENTION_WORKER_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .default(60000),
    RETENTION_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
    RETENTION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
    RETENTION_LEASE_MS: z.coerce.number().int().min(10000).default(120000),
    RETENTION_RETRY_BASE_MS: z.coerce.number().int().min(1000).default(60000),
    AUDIT_MANIFEST_WORKER_ENABLED: z
      .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
      .transform((value) => value === true || value === "true" || value === "1")
      .default(false),
    AUDIT_MANIFEST_WORKER_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .default(3_600_000),
    OPERATIONS_JOB_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(3),
    OPERATIONS_JOB_LEASE_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .default(120_000),
    OPERATIONS_RETRY_BASE_MS: z.coerce.number().int().min(1000).default(60_000),
    CLAMAV_HOST: z.string().min(1).default("localhost"),
    CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
    STORAGE_SCANNER_ENABLED: environmentBoolean.default(false),
    ATTENDANCE_WORKER_ENABLED: environmentBoolean.default(false),
    ABSENCE_WORKER_ENABLED: environmentBoolean.default(false),
    ABSENCE_EVALUATION_START_DATE: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.iso.date().optional(),
    ),
    STORAGE_WORKER_ENABLED: environmentBoolean.default(true),
    STORAGE_WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
    STORAGE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    STORAGE_RECONCILER_ENABLED: environmentBoolean.default(false),
    REPORTS_WORKER_ENABLED: environmentBoolean.default(true),
    REPORTS_WORKER_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .default(60000),
    REPORTS_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(10),
    REPORTS_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
    REPORTS_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(1073741824)
      .default(268435456),
    REPORTS_LEASE_MS: z.coerce.number().int().min(10000).default(120000),
    REPORTS_RETRY_BASE_MS: z.coerce.number().int().min(1000).default(60000),
    SMTP_ENABLED: environmentBoolean.default(false),
    OUTBOX_WORKER_ENABLED: environmentBoolean.default(true),
    SMTP_HOST: z.string().min(1).default("localhost"),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().email().default("no-reply@ares.local"),
    SMTP_TLS: environmentBoolean.default(false),
    SMTP_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),
    STORAGE_ORPHAN_MIN_AGE_MS: z.coerce.number().int().min(0).default(3600000),
  })
  .superRefine(
    (
      {
        NODE_ENV,
        SESSION_SECRET,
        OUTBOX_ENCRYPTION_KEY,
        MFA_ENCRYPTION_KEY,
        SUPPRESSION_JOURNAL_HMAC_SECRET,
        SMTP_ENABLED,
        SMTP_HOST,
        SMTP_USER,
        SMTP_PASSWORD,
        VISITS_ENABLED,
        VISITS_TOKEN_KEY,
        VISITS_TOKEN_ACTIVE_VERSION,
        VISITS_TOKEN_KEYRING,
        DATABASE_TLS_ENABLED,
        DATABASE_TLS_CA,
        DATABASE_TLS_SERVERNAME,
        PASSWORD_DENY_FILE,
        PASSWORD_DENY_FILE_SHA256,
        S3_DOWNLOAD_ENDPOINT,
        OBJECT_DELETION_HMAC_KEYRING,
      },
      context,
    ) => {
      try {
        if (
          NODE_ENV === "production" &&
          Object.values(
            parseDeletionKeyring(OBJECT_DELETION_HMAC_KEYRING),
          ).some((secret) => !hasSecureEntropy(secret))
        )
          context.addIssue({
            code: "custom",
            path: ["OBJECT_DELETION_HMAC_KEYRING"],
            message:
              "Production deletion verification keys require secure secrets",
          });
      } catch {
        /* Field validation already records malformed rings. */
      }
      if (!DATABASE_TLS_ENABLED && (DATABASE_TLS_CA || DATABASE_TLS_SERVERNAME))
        context.addIssue({
          code: "custom",
          path: ["DATABASE_TLS_ENABLED"],
          message: "TLS trust options require verified TLS",
        });
      if (!!PASSWORD_DENY_FILE !== !!PASSWORD_DENY_FILE_SHA256)
        context.addIssue({
          code: "custom",
          path: ["PASSWORD_DENY_FILE"],
          message:
            "Corpus path and approved checksum must be supplied together",
        });
      if (
        NODE_ENV === "production" &&
        S3_DOWNLOAD_ENDPOINT &&
        !S3_DOWNLOAD_ENDPOINT.startsWith("https://")
      )
        context.addIssue({
          code: "custom",
          path: ["S3_DOWNLOAD_ENDPOINT"],
          message:
            "Public download signing endpoint requires HTTPS in production",
        });
      if (VISITS_TOKEN_KEYRING) {
        try {
          const keys = parseVisitKeyring(VISITS_TOKEN_KEYRING);
          if (
            !Object.hasOwn(keys, VISITS_TOKEN_ACTIVE_VERSION) ||
            (NODE_ENV === "production" &&
              Object.values(keys).some((key) => !hasSecureEntropy(key)))
          )
            context.addIssue({
              code: "custom",
              path: ["VISITS_TOKEN_KEYRING"],
              message: "Visit keyring must contain an active secure key",
            });
        } catch {
          /* Field refinement reports malformed keyring. */
        }
      } else if (VISITS_TOKEN_ACTIVE_VERSION !== "legacy")
        context.addIssue({
          code: "custom",
          path: ["VISITS_TOKEN_ACTIVE_VERSION"],
          message: "A versioned visit key requires a keyring",
        });
      if (
        NODE_ENV === "production" &&
        VISITS_ENABLED &&
        !VISITS_TOKEN_KEYRING &&
        !hasSecureEntropy(VISITS_TOKEN_KEY)
      )
        context.addIssue({
          code: "custom",
          path: ["VISITS_TOKEN_KEY"],
          message: "VISITS_TOKEN_KEY must be replaced in production",
        });
      if (
        NODE_ENV === "production" &&
        insecureProductionSecrets.has(SESSION_SECRET)
      ) {
        context.addIssue({
          code: "custom",
          path: ["SESSION_SECRET"],
          message: "SESSION_SECRET must be replaced in production",
        });
      }
      if (
        NODE_ENV === "production" &&
        !hasSecureEntropy(OUTBOX_ENCRYPTION_KEY)
      ) {
        context.addIssue({
          code: "custom",
          path: ["OUTBOX_ENCRYPTION_KEY"],
          message: "OUTBOX_ENCRYPTION_KEY must be replaced in production",
        });
      }
      if (NODE_ENV === "production" && !hasSecureEntropy(MFA_ENCRYPTION_KEY))
        context.addIssue({
          code: "custom",
          path: ["MFA_ENCRYPTION_KEY"],
          message: "MFA_ENCRYPTION_KEY must be replaced in production",
        });
      if (
        NODE_ENV === "production" &&
        !hasSecureEntropy(SUPPRESSION_JOURNAL_HMAC_SECRET)
      )
        context.addIssue({
          code: "custom",
          path: ["SUPPRESSION_JOURNAL_HMAC_SECRET"],
          message:
            "SUPPRESSION_JOURNAL_HMAC_SECRET must be replaced in production",
        });
      if (
        NODE_ENV === "production" &&
        SMTP_ENABLED &&
        (!SMTP_USER || !SMTP_PASSWORD || SMTP_HOST === "localhost")
      )
        context.addIssue({
          code: "custom",
          path: ["SMTP_HOST"],
          message: "SMTP production configuration is required",
        });
    },
  );

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>) {
  return environmentSchema.parse(config);
}
