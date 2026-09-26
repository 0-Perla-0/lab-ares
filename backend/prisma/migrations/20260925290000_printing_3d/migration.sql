CREATE TABLE `TrabajoImpresion3D` (
  `id` VARCHAR(30) NOT NULL,
  `solicitanteId` INTEGER NOT NULL,
  `archivoId` VARCHAR(30) NOT NULL,
  `descripcion` VARCHAR(2000) NOT NULL,
  `estado` ENUM('SOLICITADO','EN_REVISION','APROBADO','EN_COLA','EN_IMPRESION','COMPLETADO','RECHAZADO','CANCELADO','FALLIDO') NOT NULL DEFAULT 'SOLICITADO',
  `sedeId` INTEGER NULL,
  `areaId` INTEGER NULL,
  `operadorAsignadoId` INTEGER NULL,
  `revisadoPorId` INTEGER NULL,
  `motivoRevision` VARCHAR(1000) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `assignedAt` DATETIME(3) NULL,
  `canceladoPorId` INTEGER NULL,
  `motivoCancelacion` VARCHAR(1000) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `TrabajoImpresion3D_solicitanteId_createdAt_idx`(`solicitanteId`,`createdAt`),
  INDEX `TrabajoImpresion3D_estado_sedeId_areaId_createdAt_idx`(`estado`,`sedeId`,`areaId`,`createdAt`),
  INDEX `TrabajoImpresion3D_operadorAsignadoId_estado_createdAt_idx`(`operadorAsignadoId`,`estado`,`createdAt`),
  INDEX `TrabajoImpresion3D_archivoId_idx`(`archivoId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `TrabajoImpresion3D_solicitanteId_fkey` FOREIGN KEY (`solicitanteId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `TrabajoImpresion3D_archivoId_fkey` FOREIGN KEY (`archivoId`) REFERENCES `Archivo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `TrabajoImpresion3D_operadorAsignadoId_fkey` FOREIGN KEY (`operadorAsignadoId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `TrabajoImpresion3D_revisadoPorId_fkey` FOREIGN KEY (`revisadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `TrabajoImpresion3D_canceladoPorId_fkey` FOREIGN KEY (`canceladoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `TrabajoImpresion3D_review_state_chk` CHECK (
    (`estado` = 'SOLICITADO' AND `revisadoPorId` IS NULL AND `reviewedAt` IS NULL)
    OR (`estado` = 'EN_REVISION' AND `revisadoPorId` IS NOT NULL AND `reviewedAt` IS NULL)
    OR (`estado` IN ('APROBADO','EN_COLA','EN_IMPRESION','COMPLETADO','RECHAZADO','FALLIDO') AND `revisadoPorId` IS NOT NULL AND `reviewedAt` IS NOT NULL)
    OR (`estado` = 'CANCELADO')
  ),
  CONSTRAINT `TrabajoImpresion3D_rejection_reason_chk` CHECK (`estado` <> 'RECHAZADO' OR `motivoRevision` IS NOT NULL),
  CONSTRAINT `TrabajoImpresion3D_assignment_chk` CHECK (`estado` NOT IN ('EN_COLA','EN_IMPRESION','COMPLETADO','FALLIDO') OR (`operadorAsignadoId` IS NOT NULL AND `assignedAt` IS NOT NULL)),
  CONSTRAINT `TrabajoImpresion3D_cancellation_chk` CHECK ((`estado` = 'CANCELADO' AND `canceladoPorId` IS NOT NULL AND `motivoCancelacion` IS NOT NULL AND `cancelledAt` IS NOT NULL) OR (`estado` <> 'CANCELADO' AND `canceladoPorId` IS NULL AND `motivoCancelacion` IS NULL AND `cancelledAt` IS NULL))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EjecucionImpresion3D` (
  `id` VARCHAR(30) NOT NULL,
  `trabajoId` VARCHAR(30) NOT NULL,
  `operadorId` INTEGER NOT NULL,
  `numero` INTEGER NOT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  `material` VARCHAR(120) NOT NULL,
  `pesoGramos` INTEGER NULL,
  `resultado` ENUM('COMPLETADA','FALLIDA','CANCELADA') NULL,
  `observacion` VARCHAR(2000) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `EjecucionImpresion3D_trabajoId_numero_key`(`trabajoId`,`numero`),
  INDEX `EjecucionImpresion3D_operadorId_startedAt_idx`(`operadorId`,`startedAt`),
  INDEX `EjecucionImpresion3D_trabajoId_finishedAt_idx`(`trabajoId`,`finishedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EjecucionImpresion3D_trabajoId_fkey` FOREIGN KEY (`trabajoId`) REFERENCES `TrabajoImpresion3D`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EjecucionImpresion3D_operadorId_fkey` FOREIGN KEY (`operadorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EjecucionImpresion3D_numero_chk` CHECK (`numero` > 0),
  CONSTRAINT `EjecucionImpresion3D_weight_chk` CHECK (`pesoGramos` IS NULL OR `pesoGramos` > 0),
  CONSTRAINT `EjecucionImpresion3D_finish_chk` CHECK ((`finishedAt` IS NULL AND `resultado` IS NULL) OR (`finishedAt` IS NOT NULL AND `resultado` IS NOT NULL))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OperacionImpresion3D` (
  `id` VARCHAR(30) NOT NULL,
  `actorId` INTEGER NOT NULL,
  `key` VARCHAR(128) NOT NULL,
  `requestHash` CHAR(64) NOT NULL,
  `tipo` ENUM('CREAR_TRABAJO','INICIAR_REVISION','RESOLVER_REVISION','ASIGNAR_OPERADOR','INICIAR_EJECUCION','FINALIZAR_EJECUCION','REENCOLAR','CANCELAR') NOT NULL,
  `trabajoId` VARCHAR(30) NULL,
  `ejecucionId` VARCHAR(30) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `OperacionImpresion3D_actorId_key_key`(`actorId`,`key`),
  INDEX `OperacionImpresion3D_trabajoId_createdAt_idx`(`trabajoId`,`createdAt`),
  INDEX `OperacionImpresion3D_ejecucionId_idx`(`ejecucionId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `OperacionImpresion3D_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `OperacionImpresion3D_trabajoId_fkey` FOREIGN KEY (`trabajoId`) REFERENCES `TrabajoImpresion3D`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `OperacionImpresion3D_ejecucionId_fkey` FOREIGN KEY (`ejecucionId`) REFERENCES `EjecucionImpresion3D`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
