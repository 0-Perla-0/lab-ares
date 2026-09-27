import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

type CorrelationStore = { correlationId: string };

@Injectable()
export class CorrelationContext {
  private readonly storage = new AsyncLocalStorage<CorrelationStore>();

  run<T>(correlationId: string, callback: () => T): T {
    return this.storage.run({ correlationId }, callback);
  }

  getId(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }
}
