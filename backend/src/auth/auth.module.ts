import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginRateLimitGuard, LoginRateLimiter } from "./login-rate-limiter";
import { PrismaSessionStore } from "./prisma-session.store";
import { UserRepository } from "./user.repository";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    UserRepository,
    PrismaSessionStore,
    LoginRateLimiter,
    LoginRateLimitGuard,
  ],
  exports: [AuthService, UserRepository, PrismaSessionStore],
})
export class AuthModule {}
