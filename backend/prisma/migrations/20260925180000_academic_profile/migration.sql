CREATE TABLE `InstitucionAcademica` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(191) NOT NULL,
  `activa` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `InstitucionAcademica_nombre_key` (`nombre`),
  INDEX `InstitucionAcademica_activa_idx` (`activa`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UnidadAcademica` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(191) NOT NULL,
  `activa` BOOLEAN NOT NULL DEFAULT true,
  `institucionId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `UnidadAcademica_institucionId_nombre_key` (`institucionId`, `nombre`),
  INDEX `UnidadAcademica_institucionId_activa_idx` (`institucionId`, `activa`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProgramaAcademico` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(191) NOT NULL,
  `activa` BOOLEAN NOT NULL DEFAULT true,
  `unidadAcademicaId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ProgramaAcademico_unidadAcademicaId_nombre_key` (`unidadAcademicaId`, `nombre`),
  INDEX `ProgramaAcademico_unidadAcademicaId_activa_idx` (`unidadAcademicaId`, `activa`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CohorteAcademica` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(100) NOT NULL,
  `activa` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CohorteAcademica_nombre_key` (`nombre`),
  INDEX `CohorteAcademica_activa_idx` (`activa`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AdscripcionAcademica` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `usuarioId` INTEGER NOT NULL,
  `institucionId` INTEGER NOT NULL,
  `unidadAcademicaId` INTEGER NULL,
  `programaAcademicoId` INTEGER NOT NULL,
  `cohorteId` INTEGER NULL,
  `inicio` DATE NOT NULL,
  `fin` DATE NULL,
  `vigente` BOOLEAN NOT NULL DEFAULT true,
  `estado` ENUM('PENDIENTE_CONFIRMACION','CONFIRMADA','RECHAZADA') NOT NULL DEFAULT 'PENDIENTE_CONFIRMACION',
  `motivoRechazo` VARCHAR(500) NULL,
  `solicitadoPorId` INTEGER NULL,
  `confirmadoPorId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `AdscripcionAcademica_usuarioId_vigente_inicio_idx` (`usuarioId`, `vigente`, `inicio`),
  INDEX `AdscripcionAcademica_institucionId_programaAcademicoId_idx` (`institucionId`, `programaAcademicoId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UnidadAcademica` ADD CONSTRAINT `UnidadAcademica_institucionId_fkey` FOREIGN KEY (`institucionId`) REFERENCES `InstitucionAcademica`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ProgramaAcademico` ADD CONSTRAINT `ProgramaAcademico_unidadAcademicaId_fkey` FOREIGN KEY (`unidadAcademicaId`) REFERENCES `UnidadAcademica`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AdscripcionAcademica` ADD CONSTRAINT `AdscripcionAcademica_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AdscripcionAcademica` ADD CONSTRAINT `AdscripcionAcademica_institucionId_fkey` FOREIGN KEY (`institucionId`) REFERENCES `InstitucionAcademica`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AdscripcionAcademica` ADD CONSTRAINT `AdscripcionAcademica_unidadAcademicaId_fkey` FOREIGN KEY (`unidadAcademicaId`) REFERENCES `UnidadAcademica`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AdscripcionAcademica` ADD CONSTRAINT `AdscripcionAcademica_programaAcademicoId_fkey` FOREIGN KEY (`programaAcademicoId`) REFERENCES `ProgramaAcademico`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AdscripcionAcademica` ADD CONSTRAINT `AdscripcionAcademica_cohorteId_fkey` FOREIGN KEY (`cohorteId`) REFERENCES `CohorteAcademica`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
