import { Injectable, PipeTransform } from "@nestjs/common";

import { ApiException } from "../errors/api.exception";

@Injectable()
export class PositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new ApiException("VALIDATION_ERROR", 400, {
        errors: ["Expected a positive integer route parameter"],
      });
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed)) {
      throw new ApiException("VALIDATION_ERROR", 400, {
        errors: ["Expected a safe integer route parameter"],
      });
    }

    return parsed;
  }
}
