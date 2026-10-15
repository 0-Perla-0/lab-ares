-- Additive protocol; never rewrite historical file metadata or migrations.
ALTER TABLE `Archivo` MODIFY `status` ENUM('RECIBIDO','PENDIENTE_ANALISIS','ANALIZANDO','DISPONIBLE','RECHAZADO','ERROR_ANALISIS','ELIMINADO','ELIMINACION_PENDIENTE') NOT NULL DEFAULT 'RECIBIDO';
CREATE TABLE `ObjectDeletionJob` (
  `id` VARCHAR(30) NOT NULL,
  `fileId` VARCHAR(30) NOT NULL,
  `purpose` VARCHAR(30) NOT NULL,
  `resourceId` VARCHAR(191) NULL,
  `originalStatus` ENUM('RECIBIDO','PENDIENTE_ANALISIS','ANALIZANDO','DISPONIBLE','RECHAZADO','ERROR_ANALISIS','ELIMINADO','ELIMINACION_PENDIENTE') NOT NULL,
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
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ObjectDeletionJob_fileId_key` (`fileId`),
  UNIQUE INDEX `ObjectDeletionJob_manifestHash_key` (`manifestHash`),
  UNIQUE INDEX `ObjectDeletionJob_manifestRef_key` (`manifestRef`),
  INDEX `ObjectDeletionJob_state_leaseUntil_idx` (`state`,`leaseUntil`),
  CONSTRAINT `ObjectDeletionJob_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `Archivo`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ObjectDeletionJob_state_check` CHECK (`state` IN ('PREPARED','DISPATCHED','UNCERTAIN','VERIFIED','COMPLETE')),
  CONSTRAINT `ObjectDeletionJob_lease_check` CHECK ((`leaseOwner` IS NULL) = (`leaseUntil` IS NULL)),
  CONSTRAINT `ObjectDeletionJob_attempts_check` CHECK (`attempts` >= 0),
  CONSTRAINT `ObjectDeletionJob_dispatch_check` CHECK (`state` NOT IN ('DISPATCHED','UNCERTAIN') OR (`irreversibleAt` IS NOT NULL AND `manifestPublishedAt` IS NOT NULL)),
  CONSTRAINT `ObjectDeletionJob_verified_check` CHECK (`state` NOT IN ('VERIFIED','COMPLETE') OR `verifiedAt` IS NOT NULL),
  CONSTRAINT `ObjectDeletionJob_complete_check` CHECK (`state` <> 'COMPLETE' OR `completedAt` IS NOT NULL)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TRIGGER `ObjectDeletionJob_identity_immutable` BEFORE UPDATE ON `ObjectDeletionJob` FOR EACH ROW
BEGIN
  IF NOT (NEW.fileId <=> OLD.fileId) OR NOT (NEW.purpose <=> OLD.purpose) OR NOT (NEW.resourceId <=> OLD.resourceId)
     OR NOT (NEW.originalStatus <=> OLD.originalStatus) OR NOT (BINARY NEW.manifest <=> BINARY OLD.manifest)
     OR NOT (NEW.manifestHash <=> OLD.manifestHash) OR NOT (NEW.manifestRef <=> OLD.manifestRef) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OBJECT_DELETION_IDENTITY_IMMUTABLE';
  END IF;
END;

CREATE TRIGGER `Archivo_deletion_identity_guard` BEFORE UPDATE ON `Archivo` FOR EACH ROW
BEGIN
  IF OLD.status IN ('ELIMINACION_PENDIENTE','ELIMINADO') AND
     (NEW.status NOT IN ('ELIMINACION_PENDIENTE','ELIMINADO') OR (OLD.status = 'ELIMINADO' AND NEW.status <> 'ELIMINADO') OR NOT (NEW.objectKey <=> OLD.objectKey) OR NOT (NEW.quarantineKey <=> OLD.quarantineKey)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FILE_DELETION_RESERVED';
  END IF;
END;

-- FK locking alone is insufficient: a stale prevalidated attachment could wait
-- on the parent then commit after reservation. Recheck under the parent lock.
CREATE PROCEDURE `ares_assert_file_attachable`(IN file_id VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci)
BEGIN
  DECLARE file_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  IF file_id IS NOT NULL THEN
    SELECT `status` INTO file_status FROM `Archivo` WHERE id = file_id FOR UPDATE;
    IF file_status IN ('ELIMINACION_PENDIENTE','ELIMINADO') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FILE_DELETION_RESERVED';
    END IF;
  END IF;
END;
CREATE TRIGGER `DocumentoVersion_deletion_insert` BEFORE INSERT ON `DocumentoVersion` FOR EACH ROW CALL ares_assert_file_attachable(NEW.archivoId);
CREATE TRIGGER `DocumentoVersion_deletion_update` BEFORE UPDATE ON `DocumentoVersion` FOR EACH ROW BEGIN IF NOT (NEW.archivoId <=> OLD.archivoId) THEN CALL ares_assert_file_attachable(NEW.archivoId); END IF; END;
CREATE TRIGGER `EntregaEvidenciaKairos_deletion_insert` BEFORE INSERT ON `EntregaEvidenciaKairos` FOR EACH ROW CALL ares_assert_file_attachable(NEW.archivoId);
CREATE TRIGGER `EntregaEvidenciaKairos_deletion_update` BEFORE UPDATE ON `EntregaEvidenciaKairos` FOR EACH ROW BEGIN IF NOT (NEW.archivoId <=> OLD.archivoId) THEN CALL ares_assert_file_attachable(NEW.archivoId); END IF; END;
CREATE TRIGGER `VersionBiblioteca_deletion_insert` BEFORE INSERT ON `VersionBiblioteca` FOR EACH ROW CALL ares_assert_file_attachable(NEW.archivoId);
CREATE TRIGGER `VersionBiblioteca_deletion_update` BEFORE UPDATE ON `VersionBiblioteca` FOR EACH ROW BEGIN IF NOT (NEW.archivoId <=> OLD.archivoId) THEN CALL ares_assert_file_attachable(NEW.archivoId); END IF; END;
CREATE TRIGGER `TrabajoImpresion3D_deletion_insert` BEFORE INSERT ON `TrabajoImpresion3D` FOR EACH ROW CALL ares_assert_file_attachable(NEW.archivoId);
CREATE TRIGGER `TrabajoImpresion3D_deletion_update` BEFORE UPDATE ON `TrabajoImpresion3D` FOR EACH ROW BEGIN IF NOT (NEW.archivoId <=> OLD.archivoId) THEN CALL ares_assert_file_attachable(NEW.archivoId); END IF; END;
CREATE TRIGGER `JustificacionAusencia_deletion_insert` BEFORE INSERT ON `JustificacionAusencia` FOR EACH ROW CALL ares_assert_file_attachable(NEW.archivoId);
CREATE TRIGGER `JustificacionAusencia_deletion_update` BEFORE UPDATE ON `JustificacionAusencia` FOR EACH ROW BEGIN IF NOT (NEW.archivoId <=> OLD.archivoId) THEN CALL ares_assert_file_attachable(NEW.archivoId); END IF; END;
CREATE TRIGGER `ApelacionAusencia_deletion_insert` BEFORE INSERT ON `ApelacionAusencia` FOR EACH ROW CALL ares_assert_file_attachable(NEW.archivoId);
CREATE TRIGGER `ApelacionAusencia_deletion_update` BEFORE UPDATE ON `ApelacionAusencia` FOR EACH ROW BEGIN IF NOT (NEW.archivoId <=> OLD.archivoId) THEN CALL ares_assert_file_attachable(NEW.archivoId); END IF; END;
CREATE TRIGGER `ReporteExportacion_deletion_insert` BEFORE INSERT ON `ReporteExportacion` FOR EACH ROW CALL ares_assert_file_attachable(NEW.archivoId);
CREATE TRIGGER `ReporteExportacion_deletion_update` BEFORE UPDATE ON `ReporteExportacion` FOR EACH ROW BEGIN IF NOT (NEW.archivoId <=> OLD.archivoId) THEN CALL ares_assert_file_attachable(NEW.archivoId); END IF; END;
CREATE TRIGGER `ActivoPublico_deletion_insert` BEFORE INSERT ON `ActivoPublico` FOR EACH ROW CALL ares_assert_file_attachable(NEW.archivoOrigenId);
CREATE TRIGGER `ActivoPublico_deletion_update` BEFORE UPDATE ON `ActivoPublico` FOR EACH ROW BEGIN IF NOT (NEW.archivoOrigenId <=> OLD.archivoOrigenId) THEN CALL ares_assert_file_attachable(NEW.archivoOrigenId); END IF; END;
