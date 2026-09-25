import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { StorageModule } from "../storage/storage.module";

@Module({
  controllers: [HealthController],
  providers: [HealthService],
  imports: [StorageModule],
})
export class HealthModule {}
