-- Identity core: normalize lifecycle states and add durable identity artifacts.
ALTER TABLE `Usuario` MODIFY `estado` ENUM('ACTIVO','PENDIENTE','INACTIVO','LIBERADO','BAJA','INVITADA','ACTIVA','SUSPENDIDA','DESACTIVADA','BLOQUEADA') NOT NULL DEFAULT 'PENDIENTE';
UPDATE `Usuario` SET `estado` = CASE `estado`
  WHEN 'ACTIVO' THEN 'ACTIVA'
  WHEN 'PENDIENTE' THEN 'INVITADA'
  WHEN 'INACTIVO' THEN 'SUSPENDIDA'
  WHEN 'LIBERADO' THEN 'DESACTIVADA'
  WHEN 'BAJA' THEN 'DESACTIVADA'
  ELSE 'INVITADA' END;
ALTER TABLE `Usuario` MODIFY `estado` ENUM('INVITADA','ACTIVA','SUSPENDIDA','DESACTIVADA','BLOQUEADA') NOT NULL DEFAULT 'INVITADA';

ALTER TABLE `Session`
  ADD COLUMN `userId` INTEGER NULL,
  ADD COLUMN `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `absoluteExpiresAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `revokedAt` DATETIME(3) NULL,
  ADD COLUMN `ipHash` CHAR(64) NULL,
  ADD COLUMN `userAgentSummary` VARCHAR(255) NULL,
  ADD INDEX `Session_userId_revokedAt_idx` (`userId`,`revokedAt`),
  ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `Invitation` (
  `id` VARCHAR(30) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `targetEmail` VARCHAR(191) NOT NULL,
  `targetUserId` INTEGER NULL,
  `role` ENUM('PRESTADOR','COORDINADOR','JEFE_COORDINADORES','JEFE_AREA','JEFE_SEDE','ADMIN') NOT NULL,
  `sedeId` INTEGER NULL, `areaId` INTEGER NULL, `turnoId` INTEGER NULL,
  `expiresAt` DATETIME(3) NOT NULL, `usedAt` DATETIME(3) NULL, `revokedAt` DATETIME(3) NULL,
  `createdById` INTEGER NOT NULL, `acceptedById` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Invitation_tokenHash_key` (`tokenHash`), INDEX `Invitation_targetEmail_expiresAt_idx` (`targetEmail`,`expiresAt`), INDEX `Invitation_createdById_idx` (`createdById`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Invitation_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Invitation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RecoveryToken` (
  `id` VARCHAR(30) NOT NULL, `tokenHash` CHAR(64) NOT NULL, `userId` INTEGER NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL, `usedAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `RecoveryToken_tokenHash_key` (`tokenHash`), INDEX `RecoveryToken_userId_expiresAt_idx` (`userId`,`expiresAt`), PRIMARY KEY (`id`),
  CONSTRAINT `RecoveryToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OutboxEvent` (
  `id` VARCHAR(30) NOT NULL, `type` VARCHAR(100) NOT NULL, `aggregateId` VARCHAR(100) NOT NULL,
  `payload` JSON NOT NULL, `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `processedAt` DATETIME(3) NULL, `attempts` INTEGER NOT NULL DEFAULT 0,
  INDEX `OutboxEvent_processedAt_occurredAt_idx` (`processedAt`,`occurredAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
