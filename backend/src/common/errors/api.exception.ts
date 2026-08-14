import { HttpException } from "@nestjs/common";

export class ApiException extends HttpException {
  constructor(
    readonly code: string,
    status: number,
    readonly details?: unknown,
  ) {
    super(
      { error: code, ...(details === undefined ? {} : { details }) },
      status,
    );
  }
}
