import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { AuthModule } from "../auth/auth.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
@Module({ imports: [StorageModule, AuthModule], controllers: [DocumentsController], providers: [DocumentsService] }) export class DocumentsModule {}
