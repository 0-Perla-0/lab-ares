import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { HealthModule } from "../health/health.module";
import { StorageModule } from "../storage/storage.module";
import { AuditManifestWorker } from "./audit-manifest.worker";
import { AuditController } from "./audit.controller";
import { AuditQueryService } from "./audit-query.service";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";
import { TechnicalLogger } from "./technical-logger.service";

@Module({
  imports: [AuthModule, HealthModule, StorageModule],
  controllers: [AuditController, OperationsController],
  providers: [
    AuditQueryService,
    OperationsService,
    TechnicalLogger,
    AuditManifestWorker,
  ],
  exports: [AuditQueryService, OperationsService],
})
export class OperationsModule {}
