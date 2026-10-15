import {
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import {
  FeaturePoliciesService,
  type FeatureKey,
} from "./feature-policies.service";
const KEY = "feature-policy";
export const RequireFeature = (key: FeatureKey) => SetMetadata(KEY, key);
@Injectable()
export class FeaturePolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policies: FeaturePoliciesService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const key = this.reflector.getAllAndOverride<FeatureKey>(KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (key)
      await this.policies.require(
        key,
        context.switchToHttp().getRequest<Request>().user!,
      );
    return true;
  }
}
