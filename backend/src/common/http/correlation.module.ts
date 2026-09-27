import { Global, Module } from "@nestjs/common";

import { CorrelationContext } from "./correlation-context";
import { CorrelationInterceptor } from "./correlation.interceptor";

@Global()
@Module({
  providers: [CorrelationContext, CorrelationInterceptor],
  exports: [CorrelationContext, CorrelationInterceptor],
})
export class CorrelationModule {}
