CREATE TABLE `AuditEvent` (
  `id` VARCHAR(30) NOT NULL,
  `actorId` INTEGER NULL,
  `subjectId` INTEGER NULL,
  `action` VARCHAR(100) NOT NULL,
  `resource` VARCHAR(100) NOT NULL,
  `correlationId` VARCHAR(100) NULL,
  `metadata` JSON NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AuditEvent_resource_subjectId_occurredAt_idx` (`resource`,`subjectId`,`occurredAt`),
  INDEX `AuditEvent_actorId_occurredAt_idx` (`actorId`,`occurredAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
