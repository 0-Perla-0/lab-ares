import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Observable } from "rxjs";
import type { Request, Response } from "express";

import { CorrelationContext } from "./correlation-context";

const validCorrelationId = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;

export function normalizeCorrelationId(value: unknown): string {
  return typeof value === "string" && validCorrelationId.test(value)
    ? value
    : randomUUID();
}

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HttpRequest");

  constructor(private readonly context: CorrelationContext) {}

  intercept(
    execution: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = execution.switchToHttp().getRequest<Request>();
    const response = execution.switchToHttp().getResponse<Response>();
    const correlationId = normalizeCorrelationId(
      request.headers["x-correlation-id"],
    );
    response.setHeader("X-Correlation-Id", correlationId);
    const startedAt = Date.now();
    const log = (level: "log" | "warn", statusCode: number) =>
      this.logger[level](
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "http_request",
          correlationId,
          method: request.method,
          path: request.path,
          statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );

    return new Observable((subscriber) =>
      this.context.run(correlationId, () =>
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error) => {
            log("warn", Number(error?.status ?? error?.statusCode ?? 500));
            subscriber.error(error);
          },
          complete: () => {
            log("log", response.statusCode);
            subscriber.complete();
          },
        }),
      ),
    );
  }
}
