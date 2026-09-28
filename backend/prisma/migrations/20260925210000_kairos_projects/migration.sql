CREATE TABLE `ProyectoKairos` (
  `id` varchar(30) NOT NULL,
  `nombre` varchar(191) NOT NULL,
  `descripcion` varchar(1000) NULL,
  `estado` enum('BORRADOR','ACTIVO','ARCHIVADO') NOT NULL DEFAULT 'BORRADOR',
  `prioridad` enum('BAJA','MEDIA','ALTA','CRITICA') NOT NULL DEFAULT 'MEDIA',
  `creadoPorId` int NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ProyectoKairos_creadoPorId_createdAt_idx` (`creadoPorId`,`createdAt`),
  KEY `ProyectoKairos_estado_prioridad_updatedAt_idx` (`estado`,`prioridad`,`updatedAt`),
  CONSTRAINT `ProyectoKairos_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MiembroProyectoKairos` (
  `proyectoId` varchar(30) NOT NULL,
  `usuarioId` int NOT NULL,
  `rol` enum('PROPIETARIO','SUBLIDER','COLABORADOR','OBSERVADOR') NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `removedAt` datetime(3) NULL,
  PRIMARY KEY (`proyectoId`,`usuarioId`),
  KEY `MiembroProyectoKairos_usuarioId_rol_idx` (`usuarioId`,`rol`),
  KEY `MiembroProyectoKairos_proyectoId_rol_idx` (`proyectoId`,`rol`),
  CONSTRAINT `MiembroProyectoKairos_proyectoId_fkey` FOREIGN KEY (`proyectoId`) REFERENCES `ProyectoKairos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `MiembroProyectoKairos_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FavoritoProyectoKairos` (
  `proyectoId` varchar(30) NOT NULL,
  `usuarioId` int NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`proyectoId`,`usuarioId`),
  KEY `FavoritoProyectoKairos_usuarioId_createdAt_idx` (`usuarioId`,`createdAt`),
  CONSTRAINT `FavoritoProyectoKairos_proyectoId_fkey` FOREIGN KEY (`proyectoId`) REFERENCES `ProyectoKairos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FavoritoProyectoKairos_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
