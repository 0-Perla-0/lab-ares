import { Global, Module } from "@nestjs/common";
import { FeaturePoliciesService } from "./feature-policies.service";
@Global()
@Module({
  providers: [FeaturePoliciesService],
  exports: [FeaturePoliciesService],
})
export class FeaturePoliciesModule {}
