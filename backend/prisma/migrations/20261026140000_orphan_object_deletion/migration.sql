-- Additive: cleanup of private objects no file owns, and restore acknowledgements.
-- Identity (what is deleted and its sealed manifest) is immutable; only lifecycle moves.
CREATE TABLE `OrphanObjectDeletion` (
    `id` VARCHAR(30) NOT NULL,
    `kind` VARCHAR(30) NOT NULL,
    `bucket` VARCHAR(20) NOT NULL,
    `objectKey` VARCHAR(500) NOT NULL,
    `activeKey` VARCHAR(560) NULL,
    `archivoId` VARCHAR(30) NULL,
    `manifest` JSON NOT NULL,
    `manifestHash` CHAR(64) NOT NULL,
    `manifestRef` VARCHAR(191) NOT NULL,
    `state` VARCHAR(20) NOT NULL DEFAULT 'PREPARED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `leaseOwner` VARCHAR(80) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `barrierVersion` INTEGER NULL,
    `lastErrorCode` VARCHAR(100) NULL,
    `manifestPublishedAt` DATETIME(3) NULL,
    `irreversibleAt` DATETIME(3) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrphanObjectDeletion_activeKey_key`(`activeKey`),
    UNIQUE INDEX `OrphanObjectDeletion_manifestHash_key`(`manifestHash`),
    UNIQUE INDEX `OrphanObjectDeletion_manifestRef_key`(`manifestRef`),
    INDEX `OrphanObjectDeletion_state_leaseUntil_idx`(`state`, `leaseUntil`),
    INDEX `OrphanObjectDeletion_bucket_objectKey_idx`(`bucket`, `objectKey`),
    PRIMARY KEY (`id`),
    CONSTRAINT `OrphanObjectDeletion_kind_check` CHECK (`kind` IN ('ORPHAN_OBJECT','QUARANTINE_COPY')),
    CONSTRAINT `OrphanObjectDeletion_bucket_check` CHECK (`bucket` IN ('quarantine','available')),
    CONSTRAINT `OrphanObjectDeletion_state_check` CHECK (`state` IN ('PREPARED','DISPATCHED','UNCERTAIN','VERIFIED','COMPLETE')),
    CONSTRAINT `OrphanObjectDeletion_lease_check` CHECK ((`leaseOwner` IS NULL) = (`leaseUntil` IS NULL)),
    CONSTRAINT `OrphanObjectDeletion_attempts_check` CHECK (`attempts` >= 0),
    CONSTRAINT `OrphanObjectDeletion_active_check` CHECK ((`state` = 'COMPLETE') = (`activeKey` IS NULL)),
    CONSTRAINT `OrphanObjectDeletion_dispatch_check` CHECK (`state` NOT IN ('DISPATCHED','UNCERTAIN') OR (`irreversibleAt` IS NOT NULL AND `manifestPublishedAt` IS NOT NULL)),
    CONSTRAINT `OrphanObjectDeletion_verified_check` CHECK (`state` NOT IN ('VERIFIED','COMPLETE') OR `verifiedAt` IS NOT NULL),
    CONSTRAINT `OrphanObjectDeletion_complete_check` CHECK (`state` <> 'COMPLETE' OR `completedAt` IS NOT NULL)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TRIGGER `OrphanObjectDeletion_identity_immutable` BEFORE UPDATE ON `OrphanObjectDeletion` FOR EACH ROW
BEGIN
  IF NOT (NEW.kind <=> OLD.kind) OR NOT (NEW.bucket <=> OLD.bucket) OR NOT (NEW.objectKey <=> OLD.objectKey)
     OR NOT (NEW.archivoId <=> OLD.archivoId) OR NOT (BINARY NEW.manifest <=> BINARY OLD.manifest)
     OR NOT (NEW.manifestHash <=> OLD.manifestHash) OR NOT (NEW.manifestRef <=> OLD.manifestRef) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OBJECT_CLEANUP_IDENTITY_IMMUTABLE';
  END IF;
END;

CREATE TABLE `ObjectDeletionAcknowledgement` (
    `id` VARCHAR(30) NOT NULL,
    `manifestRef` VARCHAR(191) NOT NULL,
    `manifestHash` CHAR(64) NOT NULL,
    `purpose` VARCHAR(30) NOT NULL,
    `reason` VARCHAR(40) NOT NULL,
    `recoveryRunId` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ObjectDeletionAcknowledgement_manifestRef_key`(`manifestRef`),
    PRIMARY KEY (`id`),
    CONSTRAINT `ObjectDeletionAcknowledgement_reason_check` CHECK (`reason` IN ('SUBJECT_ABSENT_IN_SNAPSHOT','ALREADY_COMPLETE'))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
