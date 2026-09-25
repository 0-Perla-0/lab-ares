import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Delete,
  Req,
  Param,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { ApiException } from "../common/errors/api.exception";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { AuthService, InvalidCredentialsError } from "./auth.service";
import { loginSchema, type LoginInput } from "./login.schema";
import {
  LoginRateLimitGuard,
  LoginRateLimiter,
  loginRateLimitKey,
} from "./login-rate-limiter";
import { Public } from "./public.decorator";
import { z } from "zod";

const recoveryRequestSchema = z.object({ email: z.email() });
const recoveryResetSchema = z.object({ token: z.string().min(20), password: z.string().min(15).max(128) });
const passwordChangeSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(15).max(128) });

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly loginRateLimiter: LoginRateLimiter,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  @UseGuards(LoginRateLimitGuard)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Req() request: Request,
  ) {
    try {
      const user = await this.auth.authenticate(input.email, input.password);

      await regenerate(request);
      request.session.userId = user.id;
      await save(request);
      this.loginRateLimiter.reset(loginRateLimitKey(request));

      return { data: user };
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new ApiException("INVALID_CREDENTIALS", 401);
      }

      throw error;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() request: Request): Promise<void> {
    await destroy(request);
  }

  @Get("me")
  me(@Req() request: Request) {
    return { data: request.user };
  }

  @Public()
  @Post("recovery/request")
  async recoveryRequest(@Body(new ZodValidationPipe(recoveryRequestSchema)) input: { email: string }) { return { data: await this.auth.requestRecovery(input.email) }; }

  @Public()
  @Post("recovery/reset")
  async recoveryReset(@Body(new ZodValidationPipe(recoveryResetSchema)) input: { token: string; password: string }) { try { return { data: await this.auth.resetRecovery(input.token, input.password) }; } catch { throw new ApiException("RECOVERY_TOKEN_INVALID", 400); } }

  @Post("password/change")
  async passwordChange(@Body(new ZodValidationPipe(passwordChangeSchema)) input: { currentPassword: string; newPassword: string }, @Req() request: Request) { try { return { data: await this.auth.changePassword(request.user!.id, input.currentPassword, input.newPassword, request.sessionID) }; } catch (error) { if (error instanceof InvalidCredentialsError) throw new ApiException("INVALID_CREDENTIALS", 401); throw error; } }

  @Get("sessions")
  async sessions(@Req() request: Request) { const rows = await this.auth.listSessions(request.user!.id); return { data: rows }; }

  @Delete("sessions/others")
  @HttpCode(204)
  async revokeOthers(@Req() request: Request) { await this.auth.revokeOtherSessions(request.user!.id, request.sessionID); }

  @Delete("sessions/:id")
  @HttpCode(204)
  async revokeSession(@Param("id") id: string, @Req() request: Request) { await this.auth.revokeSession(request.user!.id, id); }
}

function regenerate(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function save(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function destroy(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}
