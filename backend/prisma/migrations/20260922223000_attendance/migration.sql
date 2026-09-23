CREATE TABLE `Asistencia` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `openUserId` INTEGER NULL,
  `sedeId` INTEGER NOT NULL,
  `areaId` INTEGER NOT NULL,
  `turnoId` INTEGER NOT NULL,
  `checkInAt` DATETIME(3) NOT NULL,
  `checkOutAt` DATETIME(3) NULL,
  `durationSeconds` INTEGER NULL,
  `status` ENUM('ABIERTA', 'PENDIENTE', 'AUTORIZADA', 'RECHAZADA') NOT NULL DEFAULT 'ABIERTA',
  `closeReason` VARCHAR(500) NULL,
  `closedById` INTEGER NULL,
  UNIQUE INDEX `Asistencia_openUserId_key` (`openUserId`),
  INDEX `Asistencia_userId_id_idx` (`userId`, `id`),
  INDEX `Asistencia_status_areaId_id_idx` (`status`, `areaId`, `id`),
  INDEX `Asistencia_status_sedeId_id_idx` (`status`, `sedeId`, `id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Asistencia_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `Asistencia_interval_check` CHECK (
    (`status` = 'ABIERTA' AND `openUserId` IS NOT NULL AND `openUserId` = `userId` AND `checkOutAt` IS NULL AND `durationSeconds` IS NULL AND `closedById` IS NULL)
    OR (`status` <> 'ABIERTA' AND `openUserId` IS NULL AND `checkOutAt` IS NOT NULL AND `checkOutAt` >= `checkInAt` AND `durationSeconds` IS NOT NULL AND `durationSeconds` >= 0 AND `closedById` IS NOT NULL)
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AsistenciaEvento` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `attendanceId` INTEGER NOT NULL,
  `actorId` INTEGER NOT NULL,
  `action` VARCHAR(30) NOT NULL,
  `occurredAt` DATETIME(3) NOT NULL,
  `reason` VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  INDEX `AsistenciaEvento_attendanceId_id_idx` (`attendanceId`, `id`),
  CONSTRAINT `AsistenciaEvento_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `Asistencia` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AsistenciaSolicitud` (
  `actorId` INTEGER NOT NULL,
  `key` VARCHAR(100) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL,
  `response` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`actorId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
