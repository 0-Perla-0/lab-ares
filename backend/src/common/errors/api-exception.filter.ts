import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

import { DomainError, type DomainErrorKind } from "./domain-error";

const statusByKind: Record<DomainErrorKind, number> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  INVALID_INPUT: HttpStatus.BAD_REQUEST,
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader("Cache-Control", "no-store");

    if (error instanceof DomainError) {
      response.status(statusByKind[error.kind]).json({ error: error.code });
      return;
    }

    if (error instanceof HttpException) {
      const status = error.getStatus();
      const body = error.getResponse();

      response
        .status(status)
        .json(typeof body === "string" ? { error: body } : body);
      return;
    }

    this.logger.error("Unhandled API error", error);
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
