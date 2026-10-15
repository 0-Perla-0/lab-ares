import { Controller, Get, HttpCode } from "@nestjs/common";

import { Public } from "../auth/public.decorator";
import { HealthService } from "./health.service";
import { PrismaService } from "../database/prisma.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly prisma: PrismaService,
  ) {}
  // Authenticated, no privileged run details or secrets are exposed.
  @Get("operating-mode")
  async mode() {
    const barrier = await this.prisma.recoveryWriteBarrier.findUnique({
      where: { id: "global" },
      select: { active: true, snapshotAt: true },
    });
    return {
      data: {
        readOnly: !barrier || barrier.active,
        snapshotAt: barrier?.snapshotAt ?? null,
        serverTime: new Date().toISOString(),
      },
    };
  }

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
