import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";
import { PublicContentController } from "./public-content.controller";
import { PublicContentService } from "./public-content.service";

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [PublicContentController],
  providers: [PublicContentService],
  exports: [PublicContentService],
})
export class PublicContentModule {}
