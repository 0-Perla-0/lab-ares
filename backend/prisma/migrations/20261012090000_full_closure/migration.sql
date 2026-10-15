ALTER TABLE `RecoveryRun` MODIFY `scope` ENUM('CRITICO', 'IMPORTANTE', 'SECUNDARIO') NOT NULL;
ALTER TABLE `ReporteExportacion` MODIFY `type` ENUM('ATTENDANCE', 'ABSENCES', 'DOCUMENTS', 'KAIROS') NOT NULL;
CREATE TABLE `AuthThrottle` (
  `key` CHAR(64) NOT NULL,
  `count` INTEGER NOT NULL DEFAULT 0,
  `resetAt` DATETIME(3) NOT NULL,
  `blockedUntil` DATETIME(3) NULL,
  PRIMARY KEY (`key`), INDEX `AuthThrottle_resetAt_idx` (`resetAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `FeaturePolicy` (
  `module` VARCHAR(40) NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `enabled` BOOLEAN NOT NULL,
  `sedeIds` JSON NOT NULL,
  `areaIds` JSON NOT NULL,
  `userIds` JSON NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `changedById` INTEGER NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`module`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
