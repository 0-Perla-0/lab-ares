ALTER TABLE `Asistencia`
  ADD COLUMN `clientIp` VARCHAR(45) NULL,
  ADD COLUMN `geoLatitude` DECIMAL(10,8) NULL,
  ADD COLUMN `geoLongitude` DECIMAL(11,8) NULL,
  ADD COLUMN `geoAccuracyMeters` DOUBLE NULL,
  ADD COLUMN `locationRiskCode` VARCHAR(50) NULL,
  ADD COLUMN `checkoutSignal` JSON NULL,
  ADD COLUMN `isContingency` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `contingencyTicket` VARCHAR(150) NULL,
  ADD COLUMN `contingencyJustification` VARCHAR(1000) NULL;
ALTER TABLE `PoliticaAsistencia` ADD COLUMN `locationRules` JSON NULL;

CREATE TABLE `DomainOperation` (
  `actorId` INTEGER NOT NULL, `key` VARCHAR(100) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL, `response` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`actorId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InvitacionVisita` (
  `id` VARCHAR(30) NOT NULL, `codigoAcceso` CHAR(64) NOT NULL,
  `anfitrionId` INTEGER NOT NULL, `sedeId` INTEGER NOT NULL, `areaId` INTEGER NULL,
  `nombreVisitante` VARCHAR(150) NOT NULL, `institucionProcedencia` VARCHAR(150) NULL,
  `motivo` VARCHAR(500) NOT NULL, `fechaProgramada` DATE NOT NULL,
  `validaDesde` DATETIME(3) NOT NULL, `validaHasta` DATETIME(3) NOT NULL,
  `estado` ENUM('EMITIDA','REGISTRADA_ENTRADA','REGISTRADA_SALIDA','VENCIDA','CANCELADA') NOT NULL DEFAULT 'EMITIDA',
  `version` INTEGER NOT NULL DEFAULT 1,
  `entradaAt` DATETIME(3) NULL, `salidaAt` DATETIME(3) NULL,
  `registradoEntradaPorId` INTEGER NULL, `registradoSalidaPorId` INTEGER NULL,
  `observaciones` VARCHAR(1000) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `InvitacionVisita_codigoAcceso_key` (`codigoAcceso`),
  INDEX `InvitacionVisita_sedeId_fechaProgramada_estado_idx` (`sedeId`,`fechaProgramada`,`estado`),
  INDEX `InvitacionVisita_anfitrionId_createdAt_idx` (`anfitrionId`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UbicacionInventario` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `sedeId` INTEGER NOT NULL, `areaId` INTEGER NULL,
  `nombre` VARCHAR(100) NOT NULL, `codigo` VARCHAR(50) NOT NULL, `activa` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `UbicacionInventario_sedeId_codigo_key` (`sedeId`,`codigo`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ArticuloInventario` (
  `id` VARCHAR(30) NOT NULL, `codigo` VARCHAR(60) NOT NULL, `nombre` VARCHAR(150) NOT NULL,
  `descripcion` VARCHAR(1000) NULL, `tipo` ENUM('CONSUMIBLE','ACTIVO') NOT NULL,
  `unidadMedida` VARCHAR(30) NULL, `cantidadStock` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `umbralMinimo` DECIMAL(10,2) NULL,
  `estadoActivo` ENUM('DISPONIBLE','EN_PRESTAMO','EN_MANTENIMIENTO','DANIADO','BAJA') NULL,
  `version` INTEGER NOT NULL DEFAULT 1, `ubicacionId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ArticuloInventario_codigo_key` (`codigo`),
  INDEX `ArticuloInventario_tipo_estadoActivo_idx` (`tipo`,`estadoActivo`),
  INDEX `ArticuloInventario_ubicacionId_idx` (`ubicacionId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MovimientoInventario` (
  `id` VARCHAR(30) NOT NULL, `articuloId` VARCHAR(30) NOT NULL,
  `tipo` ENUM('ENTRADA','SALIDA','AJUSTE','PRESTAMO','DEVOLUCION') NOT NULL,
  `cantidad` DECIMAL(10,2) NOT NULL, `motivo` VARCHAR(500) NOT NULL,
  `actorId` INTEGER NOT NULL, `prestamoId` VARCHAR(30) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `MovimientoInventario_articuloId_createdAt_idx` (`articuloId`,`createdAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PrestamoInventario` (
  `id` VARCHAR(30) NOT NULL, `articuloId` VARCHAR(30) NOT NULL,
  `solicitanteId` INTEGER NOT NULL, `responsableId` INTEGER NOT NULL, `devueltoAId` INTEGER NULL,
  `fechaEntrega` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `fechaLimite` DATETIME(3) NOT NULL,
  `fechaDevolucion` DATETIME(3) NULL, `estado` VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
  `observaciones` VARCHAR(1000) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `PrestamoInventario_estado_fechaLimite_idx` (`estado`,`fechaLimite`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `InvitacionVisita` ADD CONSTRAINT `InvitacionVisita_anfitrionId_fkey` FOREIGN KEY (`anfitrionId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `InvitacionVisita` ADD CONSTRAINT `InvitacionVisita_sedeId_fkey` FOREIGN KEY (`sedeId`) REFERENCES `Sede`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `InvitacionVisita` ADD CONSTRAINT `InvitacionVisita_areaId_fkey` FOREIGN KEY (`areaId`) REFERENCES `Area`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `InvitacionVisita` ADD CONSTRAINT `InvitacionVisita_registradoEntradaPorId_fkey` FOREIGN KEY (`registradoEntradaPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `InvitacionVisita` ADD CONSTRAINT `InvitacionVisita_registradoSalidaPorId_fkey` FOREIGN KEY (`registradoSalidaPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UbicacionInventario` ADD CONSTRAINT `UbicacionInventario_sedeId_fkey` FOREIGN KEY (`sedeId`) REFERENCES `Sede`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UbicacionInventario` ADD CONSTRAINT `UbicacionInventario_areaId_fkey` FOREIGN KEY (`areaId`) REFERENCES `Area`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ArticuloInventario` ADD CONSTRAINT `ArticuloInventario_ubicacionId_fkey` FOREIGN KEY (`ubicacionId`) REFERENCES `UbicacionInventario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `MovimientoInventario` ADD CONSTRAINT `MovimientoInventario_articuloId_fkey` FOREIGN KEY (`articuloId`) REFERENCES `ArticuloInventario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `MovimientoInventario` ADD CONSTRAINT `MovimientoInventario_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `MovimientoInventario` ADD CONSTRAINT `MovimientoInventario_prestamoId_fkey` FOREIGN KEY (`prestamoId`) REFERENCES `PrestamoInventario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PrestamoInventario` ADD CONSTRAINT `PrestamoInventario_articuloId_fkey` FOREIGN KEY (`articuloId`) REFERENCES `ArticuloInventario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PrestamoInventario` ADD CONSTRAINT `PrestamoInventario_solicitanteId_fkey` FOREIGN KEY (`solicitanteId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PrestamoInventario` ADD CONSTRAINT `PrestamoInventario_responsableId_fkey` FOREIGN KEY (`responsableId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PrestamoInventario` ADD CONSTRAINT `PrestamoInventario_devueltoAId_fkey` FOREIGN KEY (`devueltoAId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
