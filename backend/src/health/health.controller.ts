import { Controller, Get, HttpCode } from "@nestjs/common";

import { Public } from "../auth/public.decorator";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @HttpCode(200)
  check() {
    return this.health.readiness();
  }

  @Public()
  @Get("live")
  @HttpCode(200)
  liveness() {
    return this.health.liveness();
  }

  @Public()
  @Get("ready")
  @HttpCode(200)
  readiness() {
    return this.health.readiness();
  }
}
