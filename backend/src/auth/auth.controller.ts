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
  Optional,
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
import { MfaService } from "./mfa.service";

const recoveryRequestSchema = z.object({ email: z.email() });
const recoveryResetSchema = z.object({ token: z.string().min(20), password: z.string().min(15).max(128) });
const passwordChangeSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(15).max(128) });
const mfaVerifySchema = z.object({ challenge: z.string().min(32).max(200), code: z.string().regex(/^\d{6}$/) });
const mfaRecoverySchema = z.object({ challenge: z.string().min(32).max(200), code: z.string().min(8).max(32) });
const mfaPasswordSchema = z.object({ password: z.string().min(1).max(128), code: z.string().regex(/^\d{6}$/) });

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly loginRateLimiter: LoginRateLimiter,
    @Optional() private readonly mfa?: MfaService,
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
      if (this.mfa && (await this.mfa.status(user.id)).enabled) return { data: await this.mfa.createChallenge(user.id) };

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

  @Public() @Post("mfa/verify") @HttpCode(200)
  async mfaVerify(@Body(new ZodValidationPipe(mfaVerifySchema)) input: { challenge: string; code: string }, @Req() request: Request) { const id = await this.mfa!.consumeChallenge(input.challenge, input.code); await regenerate(request); request.session.userId = id; await save(request); return { data: { authenticated: true } }; }
  @Public() @Post("mfa/recovery") @HttpCode(200)
  async mfaRecovery(@Body(new ZodValidationPipe(mfaRecoverySchema)) input: { challenge: string; code: string }, @Req() request: Request) { const id = await this.mfa!.consumeChallenge(input.challenge, input.code, true); await regenerate(request); request.session.userId = id; await save(request); return { data: { authenticated: true } }; }
  @Get("mfa") async mfaStatus(@Req() request: Request) { return { data: await this.mfa!.status(request.user!.id) }; }
  @Post("mfa/setup") async mfaSetup(@Req() request: Request) { return { data: await this.mfa!.setup(request.user!.id) }; }
  @Post("mfa/enable") async mfaEnable(@Req() request: Request, @Body(new ZodValidationPipe(z.object({code:z.string().regex(/^\d{6}$/)}))) body: { code: string }) { return { data: await this.mfa!.enable(request.user!.id, body.code) }; }
  @Post("mfa/disable") async mfaDisable(@Req() request: Request, @Body(new ZodValidationPipe(mfaPasswordSchema)) body: { password: string; code: string }) { return { data: await this.mfa!.disable(request.user!.id, body.password, body.code) }; }
  @Post("mfa/recovery-codes/regenerate") async mfaRegenerate(@Req() request: Request, @Body(new ZodValidationPipe(mfaPasswordSchema)) body: { password: string; code: string }) { return { data: await this.mfa!.regenerate(request.user!.id, body.password, body.code) }; }

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
