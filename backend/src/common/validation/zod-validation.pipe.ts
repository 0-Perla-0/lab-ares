import { Injectable, PipeTransform } from "@nestjs/common";
import { z } from "zod";

import { ApiException } from "../errors/api.exception";

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new ApiException(
        "VALIDATION_ERROR",
        400,
        z.treeifyError(result.error),
      );
    }

    return result.data;
  }
}
