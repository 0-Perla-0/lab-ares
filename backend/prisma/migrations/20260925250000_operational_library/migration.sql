CREATE TABLE `DocumentoBiblioteca` (
  `id` VARCHAR(30) NOT NULL,
  `titulo` VARCHAR(191) NOT NULL,
  `descripcion` VARCHAR(2000) NULL,
  `categoria` ENUM('MANUAL','PROCEDIMIENTO','REGLAMENTO','FORMATO','INSTRUCTIVO','PROTOCOLO','CAPACITACION','PLANTILLA','COMUNICADO_PERMANENTE','POLITICA') NOT NULL,
  `alcance` ENUM('GLOBAL','SEDE','AREA','PROYECTO') NOT NULL,
  `estado` ENUM('BORRADOR','EN_REVISION','PUBLICADO','ARCHIVADO') NOT NULL DEFAULT 'BORRADOR',
  `requiereAcuse` BOOLEAN NOT NULL DEFAULT false,
  `sedeId` INTEGER NULL,
  `areaId` INTEGER NULL,
  `proyectoId` VARCHAR(30) NULL,
  `creadoPorId` INTEGER NOT NULL,
  `archivadoPorId` INTEGER NULL,
  `motivoArchivo` VARCHAR(1000) NULL,
  `archivadoAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `DocumentoBiblioteca_alcance_estado_updatedAt_idx` (`alcance`,`estado`,`updatedAt`),
  KEY `DocumentoBiblioteca_sedeId_estado_updatedAt_idx` (`sedeId`,`estado`,`updatedAt`),
  KEY `DocumentoBiblioteca_areaId_estado_updatedAt_idx` (`areaId`,`estado`,`updatedAt`),
  KEY `DocumentoBiblioteca_proyectoId_estado_updatedAt_idx` (`proyectoId`,`estado`,`updatedAt`),
  KEY `DocumentoBiblioteca_categoria_estado_updatedAt_idx` (`categoria`,`estado`,`updatedAt`),
  CONSTRAINT `DocumentoBiblioteca_scope_chk` CHECK (
    (`alcance` = 'GLOBAL' AND `sedeId` IS NULL AND `areaId` IS NULL AND `proyectoId` IS NULL) OR
    (`alcance` = 'SEDE' AND `sedeId` IS NOT NULL AND `areaId` IS NULL AND `proyectoId` IS NULL) OR
    (`alcance` = 'AREA' AND `sedeId` IS NOT NULL AND `areaId` IS NOT NULL AND `proyectoId` IS NULL) OR
    (`alcance` = 'PROYECTO' AND `sedeId` IS NULL AND `areaId` IS NULL AND `proyectoId` IS NOT NULL)
  ),
  CONSTRAINT `DocumentoBiblioteca_sedeId_fkey` FOREIGN KEY (`sedeId`) REFERENCES `Sede`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `DocumentoBiblioteca_areaId_fkey` FOREIGN KEY (`areaId`) REFERENCES `Area`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `DocumentoBiblioteca_proyectoId_fkey` FOREIGN KEY (`proyectoId`) REFERENCES `ProyectoKairos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `DocumentoBiblioteca_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `DocumentoBiblioteca_archivadoPorId_fkey` FOREIGN KEY (`archivadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VersionBiblioteca` (
  `id` VARCHAR(30) NOT NULL,
  `documentoId` VARCHAR(30) NOT NULL,
  `numero` INTEGER NOT NULL,
  `estado` ENUM('BORRADOR','EN_REVISION','PUBLICADO','ARCHIVADO') NOT NULL DEFAULT 'BORRADOR',
  `archivoId` VARCHAR(30) NOT NULL,
  `autorId` INTEGER NOT NULL,
  `revisadoPorId` INTEGER NULL,
  `publicadoPorId` INTEGER NULL,
  `resumenCambios` VARCHAR(2000) NOT NULL,
  `retroalimentacion` VARCHAR(2000) NULL,
  `motivoSustitucion` VARCHAR(1000) NULL,
  `vigenteDesde` DATETIME(3) NULL,
  `vigenteHasta` DATETIME(3) NULL,
  `submittedAt` DATETIME(3) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `VersionBiblioteca_archivoId_key` (`archivoId`),
  UNIQUE KEY `VersionBiblioteca_documentoId_numero_key` (`documentoId`,`numero`),
  KEY `VersionBiblioteca_documentoId_estado_numero_idx` (`documentoId`,`estado`,`numero`),
  KEY `VersionBiblioteca_estado_publishedAt_idx` (`estado`,`publishedAt`),
  CONSTRAINT `VersionBiblioteca_effective_window_chk` CHECK (`vigenteDesde` IS NULL OR `vigenteHasta` IS NULL OR `vigenteDesde` < `vigenteHasta`),
  CONSTRAINT `VersionBiblioteca_documentoId_fkey` FOREIGN KEY (`documentoId`) REFERENCES `DocumentoBiblioteca`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `VersionBiblioteca_archivoId_fkey` FOREIGN KEY (`archivoId`) REFERENCES `Archivo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `VersionBiblioteca_autorId_fkey` FOREIGN KEY (`autorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `VersionBiblioteca_revisadoPorId_fkey` FOREIGN KEY (`revisadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `VersionBiblioteca_publicadoPorId_fkey` FOREIGN KEY (`publicadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AcuseBiblioteca` (
  `id` VARCHAR(30) NOT NULL,
  `versionId` VARCHAR(30) NOT NULL,
  `usuarioId` INTEGER NOT NULL,
  `acknowledgedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `AcuseBiblioteca_versionId_usuarioId_key` (`versionId`,`usuarioId`),
  KEY `AcuseBiblioteca_usuarioId_acknowledgedAt_idx` (`usuarioId`,`acknowledgedAt`),
  CONSTRAINT `AcuseBiblioteca_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `VersionBiblioteca`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AcuseBiblioteca_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
