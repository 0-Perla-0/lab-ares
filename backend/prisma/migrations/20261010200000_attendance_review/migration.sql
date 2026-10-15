ALTER TABLE `Asistencia` DROP CONSTRAINT `Asistencia_interval_check`;
ALTER TABLE `Asistencia`
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `requiresReview` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `riskSnapshot` JSON NULL,
  ADD COLUMN `shiftSnapshot` JSON NULL,
  ADD COLUMN `policySnapshot` JSON NULL;
ALTER TABLE `Asistencia` ADD CONSTRAINT `Asistencia_interval_check` CHECK (
  (`status` = 'ABIERTA' AND `openUserId` IS NOT NULL AND `openUserId` = `userId` AND `checkOutAt` IS NULL AND `durationSeconds` IS NULL AND `closedById` IS NULL)
  OR (`status` <> 'ABIERTA' AND `openUserId` IS NULL AND `checkOutAt` IS NOT NULL AND `checkOutAt` >= `checkInAt` AND `durationSeconds` IS NOT NULL AND `durationSeconds` >= 0 AND (`closedById` IS NOT NULL OR `closeReason` = 'CHECKOUT_OMITIDO'))
);
ALTER TABLE `AsistenciaEvento` ADD COLUMN `metadata` JSON NULL, MODIFY COLUMN `actorId` INTEGER NULL;

CREATE TABLE `AsistenciaValidacion` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `attendanceId` INTEGER NOT NULL,
  `actorId` INTEGER NOT NULL,
  `decision` ENUM('ABIERTA','PENDIENTE','AUTORIZADA','RECHAZADA') NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `previousVersion` INTEGER NOT NULL,
  `riskSnapshot` JSON NOT NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AsistenciaValidacion_attendanceId_previousVersion_key` (`attendanceId`,`previousVersion`),
  CONSTRAINT `AsistenciaValidacion_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `Asistencia` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `AsistenciaValidacion_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `AsistenciaValidacion_decision_check` CHECK (`decision` IN ('AUTORIZADA','RECHAZADA'))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PoliticaAsistencia` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `sedeId` INTEGER NOT NULL,
  `version` INTEGER NOT NULL,
  `rules` JSON NOT NULL,
  `actorId` INTEGER NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PoliticaAsistencia_sedeId_version_key` (`sedeId`,`version`),
  CONSTRAINT `PoliticaAsistencia_sedeId_fkey` FOREIGN KEY (`sedeId`) REFERENCES `Sede` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `PoliticaAsistencia_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
