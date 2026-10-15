CREATE TABLE `FormalizacionExpediente` (
  `id` VARCHAR(191) NOT NULL,
  `usuarioId` INTEGER NOT NULL,
  `inicio` DATE NOT NULL,
  `adscripcionId` INTEGER NOT NULL,
  `sedeId` INTEGER NULL,
  `areaId` INTEGER NULL,
  `formalizadoPorId` INTEGER NOT NULL,
  `academicSnapshot` JSON NOT NULL,
  `documentSnapshot` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `FormalizacionExpediente_usuarioId_inicio_key` (`usuarioId`, `inicio`),
  INDEX `FormalizacionExpediente_sedeId_areaId_inicio_idx` (`sedeId`, `areaId`, `inicio`),
  CONSTRAINT `FormalizacionExpediente_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `FormalizacionExpediente_formalizadoPorId_fkey` FOREIGN KEY (`formalizadoPorId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `FormalizacionExpediente_adscripcionId_fkey` FOREIGN KEY (`adscripcionId`) REFERENCES `AdscripcionAcademica` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
