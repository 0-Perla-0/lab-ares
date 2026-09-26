import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ClamAvScanner } from "./clamav.scanner";
import { S3Storage } from "./s3.storage";
import { StorageService } from "./storage.service";
import { StorageWorker } from "./storage.worker";
import { StorageReconciler } from "./storage.reconciler";
import { FilesController } from "./files.controller";

@Module({ imports: [DatabaseModule], controllers: [FilesController], providers: [S3Storage, ClamAvScanner, StorageService, StorageWorker, StorageReconciler, { provide: "MALWARE_SCANNER", useExisting: ClamAvScanner }], exports: [StorageService, StorageWorker, StorageReconciler, S3Storage, ClamAvScanner] })
export class StorageModule {}
