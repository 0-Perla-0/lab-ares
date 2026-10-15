CREATE TABLE `OperationalHistory` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `resourceType` VARCHAR(16) NOT NULL,
  `resourceId` INTEGER NOT NULL,
  `snapshot` JSON NOT NULL,
  `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `OperationalHistory_resourceType_resourceId_recordedAt_idx` (`resourceType`,`resourceId`,`recordedAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `AbsenceEvaluationIssue` (
  `userId` INTEGER NOT NULL, `fecha` DATE NOT NULL, `reason` VARCHAR(80) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`userId`,`fecha`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `WorkerHeartbeat` (
  `name` VARCHAR(80) NOT NULL,
  `lastStartedAt` DATETIME(3) NULL, `lastSucceededAt` DATETIME(3) NULL,
  `lastFailedAt` DATETIME(3) NULL, `errorCode` VARCHAR(100) NULL,
  `processed` INTEGER NOT NULL DEFAULT 0, `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `InvitacionVisita` ADD COLUMN `tokenKeyVersion` VARCHAR(32) NOT NULL DEFAULT 'legacy', ADD COLUMN `evidenceSuppressedAt` DATETIME(3) NULL;
ALTER TABLE `ReglaRetencion` MODIFY `categoria` ENUM('IDENTIDAD_CUENTA','PERFIL_ACADEMICO','ASISTENCIA_HORAS','AUSENCIAS_JUSTIFICANTES','EXPEDIENTE','KAIROS_EVIDENCIAS','BIBLIOTECA','AUDITORIA','NOTIFICACIONES_CORREO','SESIONES_TOKENS','LOGS','EXPORTACIONES','ARCHIVOS_RECHAZADOS','VISITAS') NOT NULL;
ALTER TABLE `RegistroRetencion` MODIFY `categoria` ENUM('IDENTIDAD_CUENTA','PERFIL_ACADEMICO','ASISTENCIA_HORAS','AUSENCIAS_JUSTIFICANTES','EXPEDIENTE','KAIROS_EVIDENCIAS','BIBLIOTECA','AUDITORIA','NOTIFICACIONES_CORREO','SESIONES_TOKENS','LOGS','EXPORTACIONES','ARCHIVOS_RECHAZADOS','VISITAS') NOT NULL;
ALTER TABLE `RegistroSupresion` MODIFY `categoria` ENUM('IDENTIDAD_CUENTA','PERFIL_ACADEMICO','ASISTENCIA_HORAS','AUSENCIAS_JUSTIFICANTES','EXPEDIENTE','KAIROS_EVIDENCIAS','BIBLIOTECA','AUDITORIA','NOTIFICACIONES_CORREO','SESIONES_TOKENS','LOGS','EXPORTACIONES','ARCHIVOS_RECHAZADOS','VISITAS') NOT NULL;
ALTER TABLE `LoteSupresion` MODIFY `categoria` ENUM('IDENTIDAD_CUENTA','PERFIL_ACADEMICO','ASISTENCIA_HORAS','AUSENCIAS_JUSTIFICANTES','EXPEDIENTE','KAIROS_EVIDENCIAS','BIBLIOTECA','AUDITORIA','NOTIFICACIONES_CORREO','SESIONES_TOKENS','LOGS','EXPORTACIONES','ARCHIVOS_RECHAZADOS','VISITAS') NULL;
-- Baseline is valid ONLY from deployment, never from the original creation date.
SET @history_cutover = UTC_TIMESTAMP(3);
INSERT INTO `OperationalHistory` (`resourceType`,`resourceId`,`snapshot`,`recordedAt`)
SELECT 'USER',id,JSON_OBJECT('rol',rol,'estado',estado,'sedeId',sedeId,'areaId',areaId,'turnoId',turnoId),@history_cutover FROM `Usuario`;
INSERT INTO `OperationalHistory` (`resourceType`,`resourceId`,`snapshot`,`recordedAt`)
SELECT 'SEDE',id,JSON_OBJECT('activa',activa),@history_cutover FROM `Sede`;
INSERT INTO `OperationalHistory` (`resourceType`,`resourceId`,`snapshot`,`recordedAt`)
SELECT 'AREA',id,JSON_OBJECT('activa',activa,'sedeId',sedeId),@history_cutover FROM `Area`;
INSERT INTO `OperationalHistory` (`resourceType`,`resourceId`,`snapshot`,`recordedAt`)
SELECT 'SHIFT',t.id,JSON_OBJECT('activo',t.activo,'areaId',t.areaId,'horaInicio',TIME_FORMAT(t.horaInicio,'%H:%i:%s'),'horaFin',TIME_FORMAT(t.horaFin,'%H:%i:%s'),'dias',JSON_QUERY(COALESCE((SELECT JSON_ARRAYAGG(d.dia) FROM `TurnoDia` d WHERE d.turnoId=t.id),'[]'),'$')),@history_cutover FROM `Turno` t;
