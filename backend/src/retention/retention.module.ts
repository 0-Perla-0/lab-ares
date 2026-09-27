import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { StorageModule } from "../storage/storage.module";
import { RetentionController } from "./retention.controller";
import { RetentionService } from "./retention.service";
import { RetentionWorker } from "./retention.worker";

@Module({
  imports: [AuthModule, NotificationsModule, StorageModule],
  controllers: [RetentionController],
  providers: [RetentionService, RetentionWorker],
})
export class RetentionModule {}
