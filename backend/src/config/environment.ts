import { z } from "zod";

export const DEVELOPMENT_SESSION_SECRET =
  "development-only-session-secret-change-me";
const DOCUMENTED_SESSION_SECRET_PLACEHOLDER =
  "replace-this-with-at-least-32-random-characters";
const insecureProductionSecrets = new Set([
  DEVELOPMENT_SESSION_SECRET,
  DOCUMENTED_SESSION_SECRET_PLACEHOLDER,
]);

const timeZone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "APP_TIME_ZONE must be a valid IANA time zone");

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.url(),
    BACKEND_HOST: z.string().min(1).default("0.0.0.0"),
    BACKEND_PORT: z.coerce.number().int().positive().max(65535).default(3000),
    FRONTEND_ORIGIN: z.url().default("http://localhost:4321"),
    APP_TIME_ZONE: timeZone.default("America/Mexico_City"),
    ATTENDANCE_ALERT_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    SESSION_SECRET: z.string().min(32).default(DEVELOPMENT_SESSION_SECRET),
    OUTBOX_ENCRYPTION_KEY: z.string().min(32).default("development-only-outbox-key-change-me-32chars"),
    S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_ACCESS_KEY: z.string().min(1).default("ares-local"),
    S3_SECRET_KEY: z.string().min(1).default("ares-local-secret"),
    S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
    S3_QUARANTINE_BUCKET: z.string().min(1).default("ares-quarantine"),
    S3_AVAILABLE_BUCKET: z.string().min(1).default("ares-available"),
    STORAGE_MAX_BYTES: z.coerce.number().int().positive().default(52428800),
    CLAMAV_HOST: z.string().min(1).default("localhost"),
    CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
    STORAGE_SCANNER_ENABLED: z.coerce.boolean().default(false),
    STORAGE_WORKER_ENABLED: z.coerce.boolean().default(true),
    STORAGE_WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
      STORAGE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
      STORAGE_RECONCILER_ENABLED: z.coerce.boolean().default(false),
      STORAGE_ORPHAN_MIN_AGE_MS: z.coerce.number().int().min(0).default(3600000),
  })
  .superRefine(({ NODE_ENV, SESSION_SECRET, OUTBOX_ENCRYPTION_KEY }, context) => {
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
    if (NODE_ENV === "production" && OUTBOX_ENCRYPTION_KEY.includes("development-only")) {
      context.addIssue({ code: "custom", path: ["OUTBOX_ENCRYPTION_KEY"], message: "OUTBOX_ENCRYPTION_KEY must be replaced in production" });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>) {
  return environmentSchema.parse(config);
}
