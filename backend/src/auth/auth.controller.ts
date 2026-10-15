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
import { permissionGrants } from "./permissions";
import { z } from "zod";
import { MfaService } from "./mfa.service";
import { RequireRecentAuth } from "./recent-auth.guard";
import { FeaturePoliciesService } from "../common/domain/feature-policies.service";

const recoveryRequestSchema = z.object({ email: z.email() });
const recoveryResetSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(15).max(128),
});
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(15).max(128),
});
const mfaVerifySchema = z.object({
  challenge: z.string().min(32).max(200),
  code: z.string().regex(/^\d{6}$/),
});
const mfaRecoverySchema = z.object({
  challenge: z.string().min(32).max(200),
  code: z.string().min(8).max(32),
});
const mfaPasswordSchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().regex(/^(?:\d{6}|[a-f0-9]{16})$/),
  recovery: z.boolean().default(false),
});

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly loginRateLimiter: LoginRateLimiter,
    @Optional() private readonly mfa?: MfaService,
    @Optional() private readonly features?: FeaturePoliciesService,
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
      if (this.mfa && (await this.mfa.status(user.id)).enabled)
        return { data: await this.mfa.createChallenge(user.id) };

      await this.auth.completedAuthentication(user.id);
      await regenerate(request);
      request.session.userId = user.id;
      request.session.authenticatedAt = Date.now();
      request.session.authenticationFactor = "password";
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
  @Post("mfa/verify")
  @UseGuards(LoginRateLimitGuard)
  @HttpCode(200)
  async mfaVerify(
    @Body(new ZodValidationPipe(mfaVerifySchema))
    input: { challenge: string; code: string },
    @Req() request: Request,
  ) {
    const id = await this.mfa!.consumeChallenge(input.challenge, input.code);
    await this.auth.completedAuthentication(id!);
    await regenerate(request);
    request.session.userId = id;
    request.session.authenticatedAt = Date.now();
    request.session.authenticationFactor = "mfa";
    await save(request);
    return { data: { authenticated: true } };
  }
  @Public()
  @Post("mfa/recovery")
  @UseGuards(LoginRateLimitGuard)
  @HttpCode(200)
  async mfaRecovery(
    @Body(new ZodValidationPipe(mfaRecoverySchema))
    input: { challenge: string; code: string },
    @Req() request: Request,
  ) {
    const id = await this.mfa!.consumeChallenge(
      input.challenge,
      input.code,
      true,
    );
    await this.auth.completedAuthentication(id!);
    await regenerate(request);
    request.session.userId = id;
    request.session.authenticatedAt = Date.now();
    request.session.authenticationFactor = "mfa";
    await save(request);
    return { data: { authenticated: true } };
  }
  @Get("mfa") async mfaStatus(@Req() request: Request) {
    return { data: await this.mfa!.status(request.user!.id) };
  }
  @UseGuards(LoginRateLimitGuard)
  @Post("mfa/setup")
  async mfaSetup(
    @Req() request: Request,
    @Body(
      new ZodValidationPipe(z.object({ password: z.string().min(1).max(128) })),
    )
    body: { password: string },
  ) {
    return { data: await this.mfa!.setup(request.user!.id, body.password) };
  }
  @UseGuards(LoginRateLimitGuard)
  @Post("mfa/enable")
  async mfaEnable(
    @Req() request: Request,
    @Body(
      new ZodValidationPipe(z.object({ code: z.string().regex(/^\d{6}$/) })),
    )
    body: { code: string },
  ) {
    return { data: await this.mfa!.enable(request.user!.id, body.code) };
  }
  @UseGuards(LoginRateLimitGuard)
  @Post("mfa/disable")
  async mfaDisable(
    @Req() request: Request,
    @Body(new ZodValidationPipe(mfaPasswordSchema))
    body: { password: string; code: string; recovery: boolean },
  ) {
    return {
      data: await this.mfa!.disable(
        request.user!.id,
        body.password,
        body.code,
        body.recovery,
      ),
    };
  }
  @UseGuards(LoginRateLimitGuard)
  @Post("mfa/recovery-codes/regenerate")
  async mfaRegenerate(
    @Req() request: Request,
    @Body(new ZodValidationPipe(mfaPasswordSchema))
    body: { password: string; code: string; recovery: boolean },
  ) {
    return {
      data: await this.mfa!.regenerate(
        request.user!.id,
        body.password,
        body.code,
        body.recovery,
      ),
    };
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() request: Request): Promise<void> {
    await destroy(request);
  }

  @Post("reauthenticate")
  @UseGuards(LoginRateLimitGuard)
  async reauthenticate(
    @Req() request: Request,
    @Body(
      new ZodValidationPipe(
        z
          .object({
            password: z.string().min(1).max(128).optional(),
            code: z
              .string()
              .regex(/^\d{6}$/)
              .optional(),
          })
          .strict(),
      ),
    )
    input: { password?: string; code?: string },
  ) {
    const user = request.user!;
    const enabled = (await this.mfa!.status(user.id)).enabled;
    if (enabled) {
      if (!input.code) throw new ApiException("MFA_CODE_REQUIRED", 400);
      await this.mfa!.consumeTotp(user.id, input.code);
    } else {
      if (!input.password) throw new ApiException("INVALID_CREDENTIALS", 401);
      try {
        await this.auth.authenticate(user.email, input.password);
      } catch (error) {
        if (error instanceof InvalidCredentialsError)
          throw new ApiException("INVALID_CREDENTIALS", 401);
        throw error;
      }
    }
    await this.auth.completedAuthentication(user.id);
    request.session.authenticatedAt = Date.now();
    request.session.authenticationFactor = enabled ? "mfa" : "password";
    await save(request);
    return { data: { authenticated: true, expiresIn: 900 } };
  }

  @Get("me")
  async me(@Req() request: Request) {
    return {
      data: {
        ...request.user!,
        permissions: permissionGrants(request.user!),
        authentication: {
          authenticatedAt: request.session.authenticatedAt ?? null,
          factor: request.session.authenticationFactor ?? null,
        },
        capabilities: await this.features?.capabilities(request.user!),
      },
    };
  }

  @Public()
  @Post("recovery/request")
  @UseGuards(LoginRateLimitGuard)
  async recoveryRequest(
    @Body(new ZodValidationPipe(recoveryRequestSchema))
    input: {
      email: string;
    },
  ) {
    return { data: await this.auth.requestRecovery(input.email) };
  }

  @Public()
  @Post("recovery/reset")
  @UseGuards(LoginRateLimitGuard)
  async recoveryReset(
    @Body(new ZodValidationPipe(recoveryResetSchema))
    input: {
      token: string;
      password: string;
    },
  ) {
    try {
      return {
        data: await this.auth.resetRecovery(input.token, input.password),
      };
    } catch (error) {
      if (error instanceof InvalidCredentialsError)
        throw new ApiException("RECOVERY_TOKEN_INVALID", 400);
      throw error;
    }
  }

  @Post("password/change")
  @RequireRecentAuth()
  @UseGuards(LoginRateLimitGuard)
  async passwordChange(
    @Body(
      new ZodValidationPipe(
        passwordChangeSchema.extend({
          code: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        }),
      ),
    )
    input: { currentPassword: string; newPassword: string; code?: string },
    @Req() request: Request,
  ) {
    try {
      return {
        data: await this.auth.changePassword(
          request.user!.id,
          input.currentPassword,
          input.newPassword,
          request.sessionID,
          input.code,
        ),
      };
    } catch (error) {
      if (error instanceof InvalidCredentialsError)
        throw new ApiException("INVALID_CREDENTIALS", 401);
      throw error;
    }
  }

  @Get("sessions")
  async sessions(@Req() request: Request) {
    const rows = await this.auth.listSessions(request.user!.id);
    return {
      data: rows.map((row) => ({
        ...row,
        current: row.id === request.sessionID,
      })),
    };
  }
  @Get("session-status")
  async sessionStatus(@Req() request: Request) {
    return {
      data: await this.auth.sessionStatus(request.user!.id, request.sessionID),
    };
  }

  @Delete("sessions/others")
  @RequireRecentAuth()
  @HttpCode(204)
  async revokeOthers(@Req() request: Request) {
    await this.auth.revokeOtherSessions(request.user!.id, request.sessionID);
  }

  @Delete("sessions/:id")
  @RequireRecentAuth()
  @HttpCode(204)
  async revokeSession(@Param("id") id: string, @Req() request: Request) {
    await this.auth.revokeSession(request.user!.id, id);
  }
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
