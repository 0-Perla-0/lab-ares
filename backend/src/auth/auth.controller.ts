import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
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
