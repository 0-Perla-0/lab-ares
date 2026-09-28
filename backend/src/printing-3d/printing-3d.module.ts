import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { StorageModule } from "../storage/storage.module";
import { Printing3dController } from "./printing-3d.controller";
import { Printing3dService } from "./printing-3d.service";

@Module({
  imports: [AuthModule, NotificationsModule, StorageModule],
  controllers: [Printing3dController],
  providers: [Printing3dService],
})
export class Printing3dModule {}
