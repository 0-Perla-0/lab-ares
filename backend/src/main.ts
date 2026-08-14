import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import session from "express-session";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { PrismaSessionStore } from "./auth/prisma-session.store";
import type { Environment } from "./config/environment";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Environment, true>);
  const isProduction = config.get("NODE_ENV", { infer: true }) === "production";

  app.setGlobalPrefix("api");
  app.use(helmet());

  if (isProduction) {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }

  app.use(
    session({
      name: "ares-session",
      secret: config.get("SESSION_SECRET", { infer: true }),
      store: app.get(PrismaSessionStore),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: SESSION_TTL_MS,
      },
    }),
  );

  app.enableCors({
    origin: config.get("FRONTEND_ORIGIN", { infer: true }),
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(
    config.get("BACKEND_PORT", { infer: true }),
    config.get("BACKEND_HOST", { infer: true }),
  );
}

void bootstrap();
