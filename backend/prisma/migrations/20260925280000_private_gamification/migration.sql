CREATE TABLE `ReglaGamificacion` (
  `id` VARCHAR(30) NOT NULL,
  `codigo` VARCHAR(80) NOT NULL,
  `version` INTEGER NOT NULL,
  `origen` ENUM('KAIROS_TERMINADA') NOT NULL,
  `puntos` INTEGER NOT NULL,
  `activa` BOOLEAN NOT NULL DEFAULT true,
  `motivo` VARCHAR(1000) NOT NULL,
  `creadoPorId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ReglaGamificacion_codigo_version_key`(`codigo`, `version`),
  INDEX `ReglaGamificacion_origen_activa_version_idx`(`origen`, `activa`, `version`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ReglaGamificacion_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ReglaGamificacion_puntos_chk` CHECK (`puntos` > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InsigniaGamificacion` (
  `id` VARCHAR(30) NOT NULL,
  `codigo` VARCHAR(80) NOT NULL,
  `version` INTEGER NOT NULL,
  `nombre` VARCHAR(120) NOT NULL,
  `descripcion` VARCHAR(500) NOT NULL,
  `umbralPuntos` INTEGER NOT NULL,
  `activa` BOOLEAN NOT NULL DEFAULT true,
  `motivo` VARCHAR(1000) NOT NULL,
  `creadoPorId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `InsigniaGamificacion_codigo_version_key`(`codigo`, `version`),
  INDEX `InsigniaGamificacion_activa_umbralPuntos_idx`(`activa`, `umbralPuntos`),
  PRIMARY KEY (`id`),
  CONSTRAINT `InsigniaGamificacion_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `InsigniaGamificacion_umbral_chk` CHECK (`umbralPuntos` > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EventoGamificacion` (
  `id` VARCHAR(30) NOT NULL,
  `usuarioId` INTEGER NOT NULL,
  `actorId` INTEGER NULL,
  `tipo` ENUM('OTORGAMIENTO','REVERSO','RECONOCIMIENTO_MANUAL') NOT NULL,
  `puntos` INTEGER NOT NULL,
  `sourceKey` VARCHAR(191) NOT NULL,
  `motivo` VARCHAR(1000) NOT NULL,
  `actividadId` VARCHAR(30) NULL,
  `reglaId` VARCHAR(30) NULL,
  `reversaDeId` VARCHAR(30) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `EventoGamificacion_sourceKey_key`(`sourceKey`),
  UNIQUE INDEX `EventoGamificacion_reversaDeId_key`(`reversaDeId`),
  INDEX `EventoGamificacion_usuarioId_createdAt_idx`(`usuarioId`, `createdAt`),
  INDEX `EventoGamificacion_actividadId_tipo_createdAt_idx`(`actividadId`, `tipo`, `createdAt`),
  INDEX `EventoGamificacion_actorId_createdAt_idx`(`actorId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EventoGamificacion_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EventoGamificacion_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EventoGamificacion_actividadId_fkey` FOREIGN KEY (`actividadId`) REFERENCES `ActividadKairos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EventoGamificacion_reglaId_fkey` FOREIGN KEY (`reglaId`) REFERENCES `ReglaGamificacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EventoGamificacion_reversaDeId_fkey` FOREIGN KEY (`reversaDeId`) REFERENCES `EventoGamificacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EventoGamificacion_puntos_chk` CHECK (`puntos` <> 0),
  CONSTRAINT `EventoGamificacion_reversal_sign_chk` CHECK ((`tipo` = 'REVERSO' AND `puntos` < 0 AND `reversaDeId` IS NOT NULL) OR (`tipo` <> 'REVERSO' AND `puntos` > 0 AND `reversaDeId` IS NULL))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `ReglaGamificacion` (`id`,`codigo`,`version`,`origen`,`puntos`,`activa`,`motivo`,`creadoPorId`,`createdAt`)
VALUES ('gamification-rule-kairos-v1','KAIROS_TERMINADA_BASE',1,'KAIROS_TERMINADA',100,true,'Regla inicial del MVP aprobada por decisión 31',NULL,CURRENT_TIMESTAMP(3));

INSERT INTO `InsigniaGamificacion` (`id`,`codigo`,`version`,`nombre`,`descripcion`,`umbralPuntos`,`activa`,`motivo`,`creadoPorId`,`createdAt`) VALUES
('gamification-badge-first-v1','PRIMER_LOGRO',1,'Primer logro','Primera actividad Kairos aprobada',100,true,'Catálogo inicial limitado del MVP',NULL,CURRENT_TIMESTAMP(3)),
('gamification-badge-collab-v1','COLABORADOR',1,'Colaborador','Cinco actividades Kairos base aprobadas',500,true,'Catálogo inicial limitado del MVP',NULL,CURRENT_TIMESTAMP(3)),
('gamification-badge-impact-v1','IMPACTO',1,'Impacto','Diez actividades Kairos base aprobadas',1000,true,'Catálogo inicial limitado del MVP',NULL,CURRENT_TIMESTAMP(3));
