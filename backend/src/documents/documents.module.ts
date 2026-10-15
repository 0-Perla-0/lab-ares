import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { AuthModule } from "../auth/auth.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { ServicePeriodsController } from "./service-periods.controller";
import { ServicePeriodsService } from "./service-periods.service";
@Module({
  imports: [StorageModule, AuthModule],
  controllers: [DocumentsController, ServicePeriodsController],
  providers: [DocumentsService, ServicePeriodsService],
})
export class DocumentsModule {}
