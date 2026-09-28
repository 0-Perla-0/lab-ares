-- Recovery/reconciliation is a governed control plane. This migration only
-- creates durable records; it never invokes a backup provider or destructive
-- restore operation. Apply it only through the controlled deployment job.

CREATE TABLE `RecoveryRun` (
  `id` VARCHAR(30) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `scope` ENUM('IMPORTANTE','SECUNDARIO') NOT NULL,
  `state` ENUM('PLANNED','FROZEN','RESTORE_RECORDED','RECONCILIATION_PREVIEWED','RECONCILED','AUDIT_VERIFIED','JOURNAL_IMPORTED','SUPPRESSIONS_REAPPLIED','READY_APPROVED','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  `isDrill` BOOLEAN NOT NULL DEFAULT false,
  `restorePoint` DATETIME(3) NULL,
  `imageVersion` VARCHAR(191) NULL,
  `externalProviderRef` VARCHAR(191) NULL,
  `createdById` INTEGER NOT NULL,
  `responsibleId` INTEGER NOT NULL,
  `frozenById` INTEGER NULL,
  `readyApprovedById` INTEGER NULL,
  `completedById` INTEGER NULL,
  `failedById` INTEGER NULL,
  `cancelledById` INTEGER NULL,
  `rpoTargetMinutes` INTEGER NOT NULL,
  `rtoTargetMinutes` INTEGER NOT NULL,
  `actualRpoMinutes` INTEGER NULL,
  `actualRtoMinutes` INTEGER NULL,
  `drillResult` ENUM('PENDING','PASSED','PARTIAL','FAILED') NOT NULL DEFAULT 'PENDING',
  `drillNotes` VARCHAR(1000) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `frozenAt` DATETIME(3) NULL,
  `restoreRecordedAt` DATETIME(3) NULL,
  `previewedAt` DATETIME(3) NULL,
  `reconciledAt` DATETIME(3) NULL,
  `auditVerifiedAt` DATETIME(3) NULL,
  `journalImportedAt` DATETIME(3) NULL,
  `suppressionsReappliedAt` DATETIME(3) NULL,
  `readyApprovedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `failedAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `RecoveryRun_state_createdAt_idx`(`state`,`createdAt`),
  INDEX `RecoveryRun_scope_state_idx`(`scope`,`state`),
  CONSTRAINT `RecoveryRun_targets_chk` CHECK (`rpoTargetMinutes` > 0 AND `rtoTargetMinutes` > 0),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RecoveryStep` (
  `id` VARCHAR(30) NOT NULL,
  `runId` VARCHAR(30) NOT NULL,
  `type` ENUM('PLAN','FREEZE','RESTORE_RECORD','RECONCILIATION_PREVIEW','RECONCILIATION_EXECUTE','AUDIT_VERIFY','JOURNAL_IMPORT','SUPPRESSION_REAPPLY','READY_APPROVAL','UNFREEZE','COMPLETE','FAIL','CANCEL') NOT NULL,
  `state` ENUM('PENDING','RUNNING','SUCCEEDED','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  `actorId` INTEGER NULL,
  `resultCode` VARCHAR(100) NULL,
  `summary` JSON NULL,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `RecoveryStep_runId_type_createdAt_idx`(`runId`,`type`,`createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RecoveryStep_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `RecoveryRun`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RecoveryCheck` (
  `id` VARCHAR(30) NOT NULL,
  `runId` VARCHAR(30) NOT NULL,
  `type` ENUM('DATABASE','STORAGE','SCANNER','OUTBOX','SECONDARY_MODULES','AUDIT_INTEGRITY','JOURNAL_INTEGRITY','READINESS') NOT NULL,
  `passed` BOOLEAN NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `summary` JSON NULL,
  `checkedById` INTEGER NULL,
  `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `RecoveryCheck_runId_type_checkedAt_idx`(`runId`,`type`,`checkedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RecoveryCheck_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `RecoveryRun`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RecoveryReconciliationRun` (
  `id` VARCHAR(30) NOT NULL,
  `runId` VARCHAR(30) NOT NULL,
  `mode` ENUM('PREVIEW','EXECUTE') NOT NULL,
  `state` ENUM('PENDING','RUNNING','SUCCEEDED','FAILED') NOT NULL DEFAULT 'PENDING',
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `requestedById` INTEGER NOT NULL,
  `leaseOwner` VARCHAR(100) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `maxAttempts` INTEGER NOT NULL DEFAULT 3,
  `result` JSON NULL,
  `errorCode` VARCHAR(100) NULL,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `RecoveryReconciliationRun_idempotencyKey_key`(`idempotencyKey`),
  INDEX `RecoveryReconciliationRun_runId_mode_state_idx`(`runId`,`mode`,`state`),
  INDEX `RecoveryReconciliationRun_state_leaseUntil_idx`(`state`,`leaseUntil`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RecoveryReconciliationRun_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `RecoveryRun`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RecoveryOperation` (
  `id` VARCHAR(30) NOT NULL,
  `runId` VARCHAR(30) NULL,
  `actorId` INTEGER NOT NULL,
  `key` VARCHAR(128) NOT NULL,
  `action` VARCHAR(80) NOT NULL,
  `requestHash` CHAR(64) NOT NULL,
  `response` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `RecoveryOperation_actorId_key_key`(`actorId`,`key`),
  INDEX `RecoveryOperation_runId_createdAt_idx`(`runId`,`createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RecoveryOperation_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `RecoveryRun`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RecoveryWriteBarrier` (
  `id` VARCHAR(30) NOT NULL DEFAULT 'global',
  `active` BOOLEAN NOT NULL DEFAULT false,
  `runId` VARCHAR(30) NULL,
  `version` INTEGER NOT NULL DEFAULT 0,
  `reasonCode` VARCHAR(100) NULL,
  `snapshotAt` DATETIME(3) NULL,
  `frozenAt` DATETIME(3) NULL,
  `frozenById` INTEGER NULL,
  `unfrozenAt` DATETIME(3) NULL,
  `unfrozenById` INTEGER NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `RecoveryWriteBarrier_runId_key`(`runId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RecoveryWriteBarrier_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `RecoveryRun`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `RecoveryWriteBarrier` (`id`, `active`, `version`, `updatedAt`)
VALUES ('global', false, 0, CURRENT_TIMESTAMP(3));

CREATE TABLE `RecoveryImportedSuppression` (
  `id` VARCHAR(30) NOT NULL,
  `runId` VARCHAR(30) NOT NULL,
  `journalEntryId` VARCHAR(64) NOT NULL,
  `payloadHash` CHAR(64) NOT NULL,
  `signature` CHAR(64) NOT NULL,
  `payload` JSON NOT NULL,
  `occurredAt` DATETIME(3) NOT NULL,
  `matchedRegistroId` VARCHAR(30) NULL,
  `verifiedAt` DATETIME(3) NOT NULL,
  `reappliedAt` DATETIME(3) NULL,
  `resultCode` VARCHAR(100) NULL,
  UNIQUE INDEX `RecoveryImportedSuppression_runId_journalEntryId_key`(`runId`,`journalEntryId`),
  INDEX `RecoveryImportedSuppression_runId_occurredAt_idx`(`runId`,`occurredAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RecoveryImportedSuppression_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `RecoveryRun`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SuppressionJournalEntry` (
  `id` VARCHAR(30) NOT NULL,
  `sequence` INTEGER NOT NULL,
  `registroSupresionId` VARCHAR(30) NOT NULL,
  `payload` JSON NOT NULL,
  `payloadHash` CHAR(64) NOT NULL,
  `previousHash` CHAR(64) NULL,
  `entryHash` CHAR(64) NOT NULL,
  `signature` CHAR(64) NULL,
  `keyVersion` VARCHAR(50) NULL,
  `state` ENUM('PENDING','PROCESSING','EXPORTED','FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `leaseOwner` VARCHAR(100) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `storageRef` VARCHAR(255) NULL,
  `lastErrorCode` VARCHAR(100) NULL,
  `exportedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SuppressionJournalEntry_sequence_key`(`sequence`),
  UNIQUE INDEX `SuppressionJournalEntry_registroSupresionId_key`(`registroSupresionId`),
  INDEX `SuppressionJournalEntry_state_nextAttemptAt_idx`(`state`,`nextAttemptAt`),
  INDEX `SuppressionJournalEntry_createdAt_idx`(`createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SuppressionJournalEntry_registroSupresionId_fkey` FOREIGN KEY (`registroSupresionId`) REFERENCES `RegistroSupresion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SuppressionJournalHead` (
  `id` VARCHAR(30) NOT NULL DEFAULT 'global',
  `lastSequence` INTEGER NOT NULL DEFAULT 0,
  `lastHash` CHAR(64) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `SuppressionJournalHead` (`id`, `lastSequence`, `updatedAt`)
VALUES ('global', 0, CURRENT_TIMESTAMP(3));
