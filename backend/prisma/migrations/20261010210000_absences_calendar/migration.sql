-- Absences and hierarchical calendar. No existing business rows are rewritten.
CREATE TABLE `Ausencia` (
    `id` VARCHAR(30) NOT NULL,
    `userId` INTEGER NOT NULL,
    `sedeId` INTEGER NOT NULL,
    `areaId` INTEGER NOT NULL,
    `turnoId` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `tipo` ENUM('INASISTENCIA_COMPLETA', 'RETARDO_MAYOR', 'ABANDONO_TURNO') NOT NULL DEFAULT 'INASISTENCIA_COMPLETA',
    `estado` ENUM('PENDIENTE_JUSTIFICACION', 'JUSTIFICACION_ENVIADA', 'EN_ACLARACION', 'JUSTIFICADA', 'NO_JUSTIFICADA', 'EN_APELACION', 'CANCELADA') NOT NULL DEFAULT 'PENDIENTE_JUSTIFICACION',
    `version` INTEGER NOT NULL DEFAULT 1,
    `plazoLimiteAt` DATETIME(3) NOT NULL,
    `aclaracionLimiteAt` DATETIME(3) NULL,
    `apelacionLimiteAt` DATETIME(3) NULL,
    `motivoResolucion` VARCHAR(1000) NULL,
    `resueltoPorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `Ausencia_estado_plazoLimiteAt_idx`(`estado`, `plazoLimiteAt`),
    INDEX `Ausencia_estado_aclaracionLimiteAt_idx`(`estado`, `aclaracionLimiteAt`),
    INDEX `Ausencia_sedeId_areaId_fecha_idx`(`sedeId`, `areaId`, `fecha`),
    UNIQUE INDEX `Ausencia_userId_fecha_key`(`userId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `JustificacionAusencia` (
    `id` VARCHAR(30) NOT NULL,
    `ausenciaId` VARCHAR(30) NOT NULL,
    `motivo` VARCHAR(2000) NOT NULL,
    `archivoId` VARCHAR(30) NULL,
    `solicitadoPor` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `JustificacionAusencia_ausenciaId_createdAt_idx`(`ausenciaId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ApelacionAusencia` (
    `id` VARCHAR(30) NOT NULL,
    `ausenciaId` VARCHAR(30) NOT NULL,
    `argumento` VARCHAR(2000) NOT NULL,
    `archivoId` VARCHAR(30) NULL,
    `resueltoPorId` INTEGER NULL,
    `resolucion` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    UNIQUE INDEX `ApelacionAusencia_ausenciaId_key`(`ausenciaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ExcepcionCalendario` (
    `id` VARCHAR(30) NOT NULL,
    `titulo` VARCHAR(150) NOT NULL,
    `motivo` VARCHAR(500) NOT NULL,
    `tipo` ENUM('FESTIVO_OFICIAL', 'VACACIONES_INSTITUCIONALES', 'SUSPENSION_OPERATIVA', 'PERMISO_INDIVIDUAL', 'HORARIO_ESPECIAL', 'ASISTENCIA_EXTRAORDINARIA') NOT NULL,
    `efecto` ENUM('SUSPENSION_ACTIVIDADES', 'HORARIO_ESPECIAL', 'ASISTENCIA_EXTRAORDINARIA', 'PERMISO_PROGRAMADO') NOT NULL,
    `alcance` ENUM('GLOBAL', 'SEDE', 'AREA', 'USUARIO') NOT NULL,
    `sedeId` INTEGER NULL,
    `areaId` INTEGER NULL,
    `usuarioId` INTEGER NULL,
    `fechaInicio` DATE NOT NULL,
    `fechaFin` DATE NOT NULL,
    `horaInicio` CHAR(8) NULL,
    `horaFin` CHAR(8) NULL,
    `aplicaAsistencia` BOOLEAN NOT NULL DEFAULT false,
    `horasEquivalentes` INTEGER NOT NULL DEFAULT 0,
    `creadoPorId` INTEGER NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `ExcepcionCalendario_alcance_fechaInicio_fechaFin_idx`(`alcance`, `fechaInicio`, `fechaFin`),
    INDEX `ExcepcionCalendario_sedeId_fechaInicio_idx`(`sedeId`, `fechaInicio`),
    INDEX `ExcepcionCalendario_usuarioId_fechaInicio_idx`(`usuarioId`, `fechaInicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CalendarRevision` (
    `id` VARCHAR(20) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO `CalendarRevision` (`id`, `version`) VALUES ('global', 0);

CREATE TABLE `CalendarPreview` (
    `id` VARCHAR(30) NOT NULL,
    `actorId` INTEGER NOT NULL,
    `fingerprint` CHAR(64) NOT NULL,
    `impactHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `CalendarPreview_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AbsenceOperation` (
    `actorId` INTEGER NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `fingerprint` CHAR(64) NOT NULL,
    `response` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`actorId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AbsenceEvaluationProgress` (
    `id` VARCHAR(20) NOT NULL,
    `fecha` DATE NOT NULL,
    `afterUserId` INTEGER NOT NULL DEFAULT 0,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Ausencia` ADD CONSTRAINT `Ausencia_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Ausencia` ADD CONSTRAINT `Ausencia_resueltoPorId_fkey` FOREIGN KEY (`resueltoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `JustificacionAusencia` ADD CONSTRAINT `JustificacionAusencia_ausenciaId_fkey` FOREIGN KEY (`ausenciaId`) REFERENCES `Ausencia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `JustificacionAusencia` ADD CONSTRAINT `JustificacionAusencia_archivoId_fkey` FOREIGN KEY (`archivoId`) REFERENCES `Archivo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `JustificacionAusencia` ADD CONSTRAINT `JustificacionAusencia_solicitadoPor_fkey` FOREIGN KEY (`solicitadoPor`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ApelacionAusencia` ADD CONSTRAINT `ApelacionAusencia_ausenciaId_fkey` FOREIGN KEY (`ausenciaId`) REFERENCES `Ausencia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ApelacionAusencia` ADD CONSTRAINT `ApelacionAusencia_archivoId_fkey` FOREIGN KEY (`archivoId`) REFERENCES `Archivo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ApelacionAusencia` ADD CONSTRAINT `ApelacionAusencia_resueltoPorId_fkey` FOREIGN KEY (`resueltoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ExcepcionCalendario` ADD CONSTRAINT `ExcepcionCalendario_sedeId_fkey` FOREIGN KEY (`sedeId`) REFERENCES `Sede`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ExcepcionCalendario` ADD CONSTRAINT `ExcepcionCalendario_areaId_fkey` FOREIGN KEY (`areaId`) REFERENCES `Area`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ExcepcionCalendario` ADD CONSTRAINT `ExcepcionCalendario_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ExcepcionCalendario` ADD CONSTRAINT `ExcepcionCalendario_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
