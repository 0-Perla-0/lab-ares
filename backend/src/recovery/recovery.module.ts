import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { HealthModule } from "../health/health.module";
import { OperationsModule } from "../operations/operations.module";
import { RetentionModule } from "../retention/retention.module";
import { StorageModule } from "../storage/storage.module";
import { RecoveryController } from "./recovery.controller";
import { RecoveryService } from "./recovery.service";
import { SuppressionJournalWorker } from "./suppression-journal.worker";

@Module({
  imports: [
    AuthModule,
    HealthModule,
    OperationsModule,
    RetentionModule,
    StorageModule,
  ],
  controllers: [RecoveryController],
  providers: [RecoveryService, SuppressionJournalWorker],
  exports: [RecoveryService],
})
export class RecoveryModule {}
