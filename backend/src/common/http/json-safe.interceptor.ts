import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { map } from "rxjs";

/** Prisma BigInt values are not JSON serializable. Never alter global prototypes. */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) &&
      value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    // Express responses, streams and Nest response wrappers are not JSON DTOs.
    if (prototype !== Object.prototype && prototype !== null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]),
    );
  }
  return value;
}

@Injectable()
export class JsonSafeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map(jsonSafe));
  }
}
