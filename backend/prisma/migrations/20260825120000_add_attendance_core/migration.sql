-- CreateEnum values are represented as native MariaDB ENUM columns below.

-- CreateTable
CREATE TABLE `Asistencia` (
    `id` CHAR(36) NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `sedeId` INTEGER NULL,
    `areaId` INTEGER NULL,
    `turnoId` INTEGER NULL,
    `estado` ENUM('ABIERTA', 'CERRADA', 'CHECKOUT_OMITIDO') NOT NULL DEFAULT 'ABIERTA',
    `entradaAt` DATETIME(3) NOT NULL,
    `salidaAt` DATETIME(3) NULL,
    `openSlot` BOOLEAN NULL DEFAULT true,
    `duracionMinutos` INTEGER NULL,
    `nivelRiesgo` ENUM('NO_EVALUADO', 'VERDE', 'AMARILLO', 'ROJO') NOT NULL DEFAULT 'NO_EVALUADO',
    `motivosRiesgo` JSON NOT NULL,
    `versionReglaRiesgo` VARCHAR(80) NOT NULL,
    `estadoValidacion` ENUM('PENDIENTE', 'REQUIERE_REVISION', 'AUTORIZADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
    `entradaLatitud` DECIMAL(10, 7) NULL,
    `entradaLongitud` DECIMAL(10, 7) NULL,
    `entradaPrecisionMetros` DOUBLE NULL,
    `entradaIp` VARCHAR(45) NULL,
    `salidaLatitud` DECIMAL(10, 7) NULL,
    `salidaLongitud` DECIMAL(10, 7) NULL,
    `salidaPrecisionMetros` DOUBLE NULL,
    `salidaIp` VARCHAR(45) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Asistencia_usuarioId_openSlot_key`(`usuarioId`, `openSlot`),
    INDEX `Asistencia_usuarioId_entradaAt_idx`(`usuarioId`, `entradaAt`),
    INDEX `Asistencia_sedeId_entradaAt_idx`(`sedeId`, `entradaAt`),
    INDEX `Asistencia_areaId_entradaAt_idx`(`areaId`, `entradaAt`),
    INDEX `Asistencia_estado_entradaAt_idx`(`estado`, `entradaAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OperacionIdempotenteAsistencia` (
    `id` CHAR(36) NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `asistenciaId` CHAR(36) NOT NULL,
    `tipo` ENUM('CHECK_IN', 'CHECK_OUT') NOT NULL,
    `clave` VARCHAR(128) NOT NULL,
    `huellaSolicitud` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OperacionIdempotenteAsistencia_usuarioId_tipo_clave_key`(`usuarioId`, `tipo`, `clave`),
    INDEX `OperacionIdempotenteAsistencia_asistenciaId_idx`(`asistenciaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventoAuditoria` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `actorUsuarioId` INTEGER NULL,
    `actorRol` ENUM('PRESTADOR', 'COORDINADOR', 'JEFE_COORDINADORES', 'JEFE_AREA', 'JEFE_SEDE', 'ADMIN') NULL,
    `actorAlcance` VARCHAR(20) NULL,
    `correlacionId` CHAR(36) NOT NULL,
    `accion` VARCHAR(100) NOT NULL,
    `objetoTipo` VARCHAR(80) NOT NULL,
    `objetoId` VARCHAR(191) NULL,
    `resultado` VARCHAR(40) NOT NULL,
    `motivo` VARCHAR(255) NULL,
    `diffPermitido` JSON NULL,
    `versionPolitica` VARCHAR(80) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EventoAuditoria_actorUsuarioId_createdAt_idx`(`actorUsuarioId`, `createdAt`),
    INDEX `EventoAuditoria_objetoTipo_objetoId_createdAt_idx`(`objetoTipo`, `objetoId`, `createdAt`),
    INDEX `EventoAuditoria_correlacionId_idx`(`correlacionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Asistencia` ADD CONSTRAINT `Asistencia_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OperacionIdempotenteAsistencia` ADD CONSTRAINT `OperacionIdempotenteAsistencia_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OperacionIdempotenteAsistencia` ADD CONSTRAINT `OperacionIdempotenteAsistencia_asistenciaId_fkey` FOREIGN KEY (`asistenciaId`) REFERENCES `Asistencia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventoAuditoria` ADD CONSTRAINT `EventoAuditoria_actorUsuarioId_fkey` FOREIGN KEY (`actorUsuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
