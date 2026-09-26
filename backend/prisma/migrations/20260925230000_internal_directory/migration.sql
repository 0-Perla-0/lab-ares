CREATE TABLE `DirectorioPreferencia` (
  `usuarioId` INTEGER NOT NULL,
  `visibleEnArea` BOOLEAN NOT NULL DEFAULT true,
  `visibleEnProyectos` BOOLEAN NOT NULL DEFAULT true,
  `mostrarEmail` BOOLEAN NOT NULL DEFAULT false,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`usuarioId`),
  CONSTRAINT `DirectorioPreferencia_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
