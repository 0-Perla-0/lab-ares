-- This migration extends the existing append-only audit event shape. It is
-- validated in CI/local tooling and must be applied only by the controlled
-- deployment migration job.
ALTER TABLE `AuditEvent`
  ADD COLUMN `actorType` VARCHAR(20) NOT NULL DEFAULT 'HUMAN',
  ADD COLUMN `actorRole` VARCHAR(40) NULL,
  ADD COLUMN `accessScope` VARCHAR(20) NULL,
  ADD COLUMN `module` VARCHAR(60) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN `objectType` VARCHAR(100) NULL,
  ADD COLUMN `objectId` VARCHAR(100) NULL,
  ADD COLUMN `result` VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN `reason` VARCHAR(500) NULL,
  ADD COLUMN `diff` JSON NULL,
  ADD COLUMN `policyVersion` VARCHAR(50) NULL,
  ADD COLUMN `batchId` VARCHAR(100) NULL,
  ADD COLUMN `jobId` VARCHAR(100) NULL,
  ADD COLUMN `sedeId` INTEGER NULL,
  ADD COLUMN `areaId` INTEGER NULL,
  ADD COLUMN `periodKey` CHAR(10) NULL,
  ADD COLUMN `chainIndex` INTEGER NULL,
  ADD COLUMN `previousHash` CHAR(64) NULL,
  ADD COLUMN `eventHash` CHAR(64) NULL,
  MODIFY `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE UNIQUE INDEX `AuditEvent_periodKey_chainIndex_key` ON `AuditEvent`(`periodKey`, `chainIndex`);
CREATE INDEX `AuditEvent_module_action_occurredAt_idx` ON `AuditEvent`(`module`, `action`, `occurredAt`);
CREATE INDEX `AuditEvent_correlationId_idx` ON `AuditEvent`(`correlationId`);
CREATE INDEX `AuditEvent_sedeId_areaId_occurredAt_idx` ON `AuditEvent`(`sedeId`, `areaId`, `occurredAt`);

CREATE TABLE `AuditManifest` (
  `id` VARCHAR(30) NOT NULL,
  `periodKey` CHAR(10) NOT NULL,
  `eventCount` INTEGER NOT NULL,
  `firstHash` CHAR(64) NULL,
  `lastHash` CHAR(64) NULL,
  `manifestHash` CHAR(64) NOT NULL,
  `storageRef` VARCHAR(255) NULL,
  `verifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AuditManifest_periodKey_key`(`periodKey`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuditChainHead` (
  `periodKey` CHAR(10) NOT NULL,
  `lastIndex` INTEGER NOT NULL DEFAULT 0,
  `lastHash` CHAR(64) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`periodKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OperationalJobExecution` (
  `id` VARCHAR(30) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `state` ENUM('PENDING','RUNNING','RETRY_SCHEDULED','SUCCEEDED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `actorType` VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
  `correlationId` VARCHAR(100) NULL,
  `payload` JSON NULL,
  `result` JSON NULL,
  `errorCode` VARCHAR(100) NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `maxAttempts` INTEGER NOT NULL DEFAULT 3,
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `leaseOwner` VARCHAR(100) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `OperationalJobExecution_idempotencyKey_key`(`idempotencyKey`),
  INDEX `OperationalJobExecution_state_nextAttemptAt_idx`(`state`,`nextAttemptAt`),
  INDEX `OperationalJobExecution_name_createdAt_idx`(`name`,`createdAt`),
  INDEX `OperationalJobExecution_leaseUntil_idx`(`leaseUntil`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OperationalJobAttempt` (
  `id` VARCHAR(30) NOT NULL,
  `executionId` VARCHAR(30) NOT NULL,
  `number` INTEGER NOT NULL,
  `owner` VARCHAR(100) NOT NULL,
  `result` ENUM('RUNNING','SUCCEEDED','FAILED','LEASE_LOST') NOT NULL DEFAULT 'RUNNING',
  `errorCode` VARCHAR(100) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  UNIQUE INDEX `OperationalJobAttempt_executionId_number_key`(`executionId`,`number`),
  INDEX `OperationalJobAttempt_result_startedAt_idx`(`result`,`startedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `OperationalJobAttempt_executionId_fkey` FOREIGN KEY (`executionId`) REFERENCES `OperationalJobExecution`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OperationalAlert` (
  `id` VARCHAR(30) NOT NULL,
  `severity` ENUM('S1','S2','S3','S4') NOT NULL,
  `state` ENUM('OPEN','ACKNOWLEDGED','RESOLVED') NOT NULL DEFAULT 'OPEN',
  `source` VARCHAR(100) NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `message` VARCHAR(500) NOT NULL,
  `jobExecutionId` VARCHAR(30) NULL,
  `acknowledgedById` INTEGER NULL,
  `acknowledgedAt` DATETIME(3) NULL,
  `resolvedById` INTEGER NULL,
  `resolvedAt` DATETIME(3) NULL,
  `resolution` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `OperationalAlert_state_severity_createdAt_idx`(`state`,`severity`,`createdAt`),
  INDEX `OperationalAlert_jobExecutionId_idx`(`jobExecutionId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `OperationalAlert_jobExecutionId_fkey` FOREIGN KEY (`jobExecutionId`) REFERENCES `OperationalJobExecution`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OperationalIncident` (
  `id` VARCHAR(30) NOT NULL,
  `externalTicketRef` VARCHAR(191) NOT NULL,
  `severity` ENUM('S1','S2','S3','S4') NOT NULL,
  `state` ENUM('ABIERTO','RECONOCIDO','INVESTIGANDO','MITIGANDO','MONITOREANDO','RESUELTO','CERRADO') NOT NULL DEFAULT 'ABIERTO',
  `ownerId` INTEGER NULL,
  `reason` VARCHAR(1000) NOT NULL,
  `communications` JSON NULL,
  `repeatedS2` BOOLEAN NOT NULL DEFAULT false,
  `postmortemDueAt` DATETIME(3) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `OperationalIncident_externalTicketRef_key`(`externalTicketRef`),
  INDEX `OperationalIncident_state_severity_createdAt_idx`(`state`,`severity`,`createdAt`),
  INDEX `OperationalIncident_ownerId_state_idx`(`ownerId`,`state`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OperationalIncidentEvent` (
  `id` VARCHAR(30) NOT NULL,
  `incidentId` VARCHAR(30) NOT NULL,
  `actorId` INTEGER NOT NULL,
  `previousState` ENUM('ABIERTO','RECONOCIDO','INVESTIGANDO','MITIGANDO','MONITOREANDO','RESUELTO','CERRADO') NULL,
  `nextState` ENUM('ABIERTO','RECONOCIDO','INVESTIGANDO','MITIGANDO','MONITOREANDO','RESUELTO','CERRADO') NULL,
  `previousSeverity` ENUM('S1','S2','S3','S4') NULL,
  `nextSeverity` ENUM('S1','S2','S3','S4') NULL,
  `ownerId` INTEGER NULL,
  `reason` VARCHAR(1000) NOT NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `OperationalIncidentEvent_incidentId_occurredAt_idx`(`incidentId`,`occurredAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `OperationalIncidentEvent_incidentId_fkey` FOREIGN KEY (`incidentId`) REFERENCES `OperationalIncident`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
