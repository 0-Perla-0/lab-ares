import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";
import { LibraryController } from "./library.controller";
import { LibraryService } from "./library.service";

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
