import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PrismaSessionStore } from "./prisma-session.store";
import { UserRepository } from "./user.repository";

@Module({
  controllers: [AuthController],
  providers: [AuthService, UserRepository, PrismaSessionStore],
  exports: [AuthService, UserRepository, PrismaSessionStore],
})
export class AuthModule {}
