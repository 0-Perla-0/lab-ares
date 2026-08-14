import { z } from "zod";

export const DEVELOPMENT_SESSION_SECRET =
  "development-only-session-secret-change-me";

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.url(),
    BACKEND_HOST: z.string().min(1).default("0.0.0.0"),
    BACKEND_PORT: z.coerce.number().int().positive().max(65535).default(3000),
    FRONTEND_ORIGIN: z.url().default("http://localhost:4321"),
    SESSION_SECRET: z.string().min(32).default(DEVELOPMENT_SESSION_SECRET),
  })
  .superRefine(({ NODE_ENV, SESSION_SECRET }, context) => {
    if (
      NODE_ENV === "production" &&
      SESSION_SECRET === DEVELOPMENT_SESSION_SECRET
    ) {
      context.addIssue({
        code: "custom",
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET must be replaced in production",
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>) {
  return environmentSchema.parse(config);
}
