CREATE TABLE `Archivo` (
  `id` VARCHAR(30) NOT NULL,
  `objectKey` VARCHAR(500) NOT NULL,
  `quarantineKey` VARCHAR(500) NOT NULL,
  `originalName` VARCHAR(255) NOT NULL,
  `detectedMime` VARCHAR(150) NULL,
  `extension` VARCHAR(20) NULL,
  `sizeBytes` BIGINT NOT NULL,
  `sha256` CHAR(64) NULL,
  `status` ENUM('RECIBIDO','PENDIENTE_ANALISIS','ANALIZANDO','DISPONIBLE','RECHAZADO','ERROR_ANALISIS','ELIMINADO') NOT NULL DEFAULT 'RECIBIDO',
  `analysisAttempts` INT NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `lastError` VARCHAR(1000) NULL, `leaseOwner` VARCHAR(80) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `Archivo_objectKey_key` (`objectKey`), UNIQUE INDEX `Archivo_quarantineKey_key` (`quarantineKey`), INDEX `Archivo_status_nextAttemptAt_idx` (`status`,`nextAttemptAt`), INDEX `Archivo_leaseUntil_idx` (`leaseUntil`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `AnalisisArchivo` (`id` VARCHAR(30) NOT NULL, `archivoId` VARCHAR(30) NOT NULL, `scanner` VARCHAR(50) NOT NULL, `resultado` ENUM('LIMPIO','INFECTADO','ERROR') NOT NULL, `signature` VARCHAR(255) NULL, `error` VARCHAR(1000) NULL, `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `finishedAt` DATETIME(3) NULL, PRIMARY KEY (`id`), INDEX `AnalisisArchivo_archivoId_startedAt_idx` (`archivoId`,`startedAt`), CONSTRAINT `AnalisisArchivo_archivoId_fkey` FOREIGN KEY (`archivoId`) REFERENCES `Archivo` (`id`) ON DELETE CASCADE ON UPDATE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
