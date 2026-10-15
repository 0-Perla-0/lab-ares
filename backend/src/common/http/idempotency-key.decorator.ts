import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { idempotencyKeySchema } from "../../attendance/attendance.schemas";
import { ZodValidationPipe } from "../validation/zod-validation.pipe";

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request>();
    return new ZodValidationPipe(idempotencyKeySchema).transform(
      request.headers["idempotency-key"],
    );
  },
);
