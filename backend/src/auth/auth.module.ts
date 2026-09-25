import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginRateLimitGuard, LoginRateLimiter } from "./login-rate-limiter";
import { PrismaSessionStore } from "./prisma-session.store";
import { UserRepository } from "./user.repository";
import { OutboxService } from "./outbox.service";
import { IdentityCleanupService } from "./identity-cleanup.service";
import { AuditService } from "./audit.service";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    UserRepository,
    PrismaSessionStore,
    LoginRateLimiter,
    LoginRateLimitGuard,
    OutboxService,
    IdentityCleanupService,
    AuditService,
  ],
  exports: [AuthService, UserRepository, PrismaSessionStore, OutboxService, AuditService],
})
export class AuthModule {}
