CREATE TABLE `PaginaPublica` (
  `id` VARCHAR(30) NOT NULL,
  `slug` VARCHAR(80) NOT NULL,
  `titulo` VARCHAR(191) NOT NULL,
  `estado` ENUM('BORRADOR','PUBLICADO','ARCHIVADO') NOT NULL DEFAULT 'BORRADOR',
  `creadoPorId` INTEGER NOT NULL,
  `archivadoPorId` INTEGER NULL,
  `motivoArchivo` VARCHAR(1000) NULL,
  `archivadoAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PaginaPublica_slug_key`(`slug`),
  INDEX `PaginaPublica_estado_updatedAt_idx`(`estado`, `updatedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PaginaPublica_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PaginaPublica_archivadoPorId_fkey` FOREIGN KEY (`archivadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VersionContenidoPublico` (
  `id` VARCHAR(30) NOT NULL,
  `paginaId` VARCHAR(30) NOT NULL,
  `numero` INTEGER NOT NULL,
  `estado` ENUM('BORRADOR','PUBLICADO','ARCHIVADO') NOT NULL DEFAULT 'BORRADOR',
  `autorId` INTEGER NOT NULL,
  `publicadoPorId` INTEGER NULL,
  `titulo` VARCHAR(191) NOT NULL,
  `resumenCambios` VARCHAR(2000) NOT NULL,
  `seoTitulo` VARCHAR(191) NULL,
  `seoDescripcion` VARCHAR(500) NULL,
  `publishedAt` DATETIME(3) NULL,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `VersionContenidoPublico_paginaId_numero_key`(`paginaId`, `numero`),
  INDEX `VersionContenidoPublico_paginaId_estado_numero_idx`(`paginaId`, `estado`, `numero`),
  INDEX `VersionContenidoPublico_estado_publishedAt_idx`(`estado`, `publishedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `VersionContenidoPublico_paginaId_fkey` FOREIGN KEY (`paginaId`) REFERENCES `PaginaPublica`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `VersionContenidoPublico_autorId_fkey` FOREIGN KEY (`autorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `VersionContenidoPublico_publicadoPorId_fkey` FOREIGN KEY (`publicadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ActivoPublico` (
  `id` VARCHAR(30) NOT NULL,
  `archivoOrigenId` VARCHAR(30) NOT NULL,
  `objectKey` VARCHAR(500) NOT NULL,
  `nombre` VARCHAR(255) NOT NULL,
  `mime` VARCHAR(150) NOT NULL,
  `sizeBytes` BIGINT NOT NULL,
  `publicadoPorId` INTEGER NOT NULL,
  `activo` BOOLEAN NOT NULL DEFAULT true,
  `motivoArchivo` VARCHAR(1000) NULL,
  `archivadoAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ActivoPublico_archivoOrigenId_key`(`archivoOrigenId`),
  UNIQUE INDEX `ActivoPublico_objectKey_key`(`objectKey`),
  INDEX `ActivoPublico_activo_createdAt_idx`(`activo`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ActivoPublico_archivoOrigenId_fkey` FOREIGN KEY (`archivoOrigenId`) REFERENCES `Archivo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ActivoPublico_publicadoPorId_fkey` FOREIGN KEY (`publicadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BloqueContenidoPublico` (
  `id` VARCHAR(30) NOT NULL,
  `versionId` VARCHAR(30) NOT NULL,
  `orden` INTEGER NOT NULL,
  `tipo` ENUM('TEXTO','ENCABEZADO','LISTA','ENLACE','AVISO','IMAGEN','FAQ') NOT NULL,
  `contenido` JSON NOT NULL,
  `activoPublicoId` VARCHAR(30) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `BloqueContenidoPublico_versionId_orden_key`(`versionId`, `orden`),
  INDEX `BloqueContenidoPublico_activoPublicoId_idx`(`activoPublicoId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `BloqueContenidoPublico_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `VersionContenidoPublico`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `BloqueContenidoPublico_activoPublicoId_fkey` FOREIGN KEY (`activoPublicoId`) REFERENCES `ActivoPublico`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `BloqueContenidoPublico_image_asset_chk` CHECK ((`tipo` = 'IMAGEN' AND `activoPublicoId` IS NOT NULL) OR (`tipo` <> 'IMAGEN' AND `activoPublicoId` IS NULL))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
