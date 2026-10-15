-- Additive baseline: never infer historical placement from current assignments.
ALTER TABLE `DocumentoVersion`
  ADD COLUMN `reportSedeId` INTEGER NULL,
  ADD COLUMN `reportAreaId` INTEGER NULL,
  ADD COLUMN `reportSnapshotAt` DATETIME(3) NULL,
  ADD INDEX `DocumentoVersion_reportSedeId_reportAreaId_createdAt_idx` (`reportSedeId`, `reportAreaId`, `createdAt`);
ALTER TABLE `ActividadKairos`
  ADD COLUMN `reportSedeId` INTEGER NULL,
  ADD COLUMN `reportAreaId` INTEGER NULL,
  ADD COLUMN `reportSnapshotAt` DATETIME(3) NULL,
  ADD INDEX `ActividadKairos_reportSedeId_reportAreaId_createdAt_idx` (`reportSedeId`, `reportAreaId`, `createdAt`);

CREATE TABLE `PeriodoServicio` (
  `id` VARCHAR(30) NOT NULL,
  `usuarioId` INTEGER NOT NULL,
  `formalizacionId` VARCHAR(191) NOT NULL,
  `inicio` DATE NOT NULL,
  `fin` DATE NOT NULL,
  `estado` ENUM('REGISTRADO','INICIADO','CERRADO','CANCELADO') NOT NULL DEFAULT 'REGISTRADO',
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PeriodoServicio_formalizacionId_key` (`formalizacionId`),
  INDEX `PeriodoServicio_usuarioId_createdAt_idx` (`usuarioId`,`createdAt`),
  CONSTRAINT `PeriodoServicio_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `PeriodoServicio_formalizacionId_fkey` FOREIGN KEY (`formalizacionId`) REFERENCES `FormalizacionExpediente` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `PeriodoServicio_dates_check` CHECK (`fin` >= `inicio`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EventoPeriodoServicio` (
  `id` VARCHAR(30) NOT NULL,
  `periodoId` VARCHAR(30) NOT NULL,
  `actorId` INTEGER NOT NULL,
  `estado` ENUM('REGISTRADO','INICIADO','CERRADO','CANCELADO') NOT NULL,
  `version` INTEGER NOT NULL,
  `motivo` VARCHAR(500) NOT NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `EventoPeriodoServicio_periodoId_version_key` (`periodoId`,`version`),
  CONSTRAINT `EventoPeriodoServicio_periodoId_fkey` FOREIGN KEY (`periodoId`) REFERENCES `PeriodoServicio` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `EventoPeriodoServicio_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
