import {
  CanActivate,
  ExecutionContext,
  Injectable,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { ApiException } from "../common/errors/api.exception";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const CLEANUP_INTERVAL_MS = 5 * 60_000;
const MAX_TRACKED_WINDOWS = 10_000;

type AttemptWindow = {
  count: number;
  resetAt: number;
};

@Injectable()
export class LoginRateLimiter implements OnModuleDestroy {
  private readonly attempts = new Map<string, AttemptWindow>();
  private readonly cleanupTimer = setInterval(
    () => this.deleteExpiredWindows(),
    CLEANUP_INTERVAL_MS,
  );

  constructor() {
    this.cleanupTimer.unref();
  }

  consume(key: string, now = Date.now()): { retryAfterSeconds: number } | null {
    const current = this.attempts.get(key);
    const window =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + WINDOW_MS }
        : current;

    if (!current) this.ensureCapacity();

    window.count += 1;
    this.attempts.set(key, window);

    if (window.count <= MAX_ATTEMPTS) return null;

    return {
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
    };
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  private deleteExpiredWindows(now = Date.now()): void {
    for (const [key, window] of this.attempts) {
      if (window.resetAt <= now) this.attempts.delete(key);
    }
  }

  private ensureCapacity(): void {
    if (this.attempts.size < MAX_TRACKED_WINDOWS) return;

    const oldestKey = this.attempts.keys().next().value as string | undefined;
    if (oldestKey) this.attempts.delete(oldestKey);
  }
}

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: LoginRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const limit = this.limiter.consume(loginRateLimitKey(request));

    if (!limit) return true;

    response.setHeader("Retry-After", String(limit.retryAfterSeconds));
    throw new ApiException("TOO_MANY_REQUESTS", 429);
  }
}

export function loginRateLimitKey(request: Request): string {
  const address = request.ip || request.socket.remoteAddress || "unknown";
  const email =
    typeof request.body?.email === "string"
      ? request.body.email.trim().toLowerCase().slice(0, 191)
      : "<invalid>";
  return `${address}:${email}`;
}
