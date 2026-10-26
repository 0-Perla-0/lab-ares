-- Additive: cross-replica upload admission (counted leases serialized by a gate row).
CREATE TABLE `UploadAdmissionGate` (
    `id` VARCHAR(20) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `UploadAdmissionGate` (`id`) VALUES ('global');

CREATE TABLE `UploadAdmission` (
    `id` VARCHAR(30) NOT NULL,
    `actorId` INTEGER NOT NULL,
    `owner` VARCHAR(80) NOT NULL,
    `leaseUntil` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UploadAdmission_leaseUntil_idx`(`leaseUntil`),
    INDEX `UploadAdmission_actorId_leaseUntil_idx`(`actorId`, `leaseUntil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
