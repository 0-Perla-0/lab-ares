-- No data rewrite. Preserve ledger references even if a parent primary key is
-- changed by SQL; cascades must not bypass the runtime append-only grants.
ALTER TABLE `MovimientoInventario`
  DROP FOREIGN KEY `MovimientoInventario_articuloId_fkey`,
  DROP FOREIGN KEY `MovimientoInventario_actorId_fkey`,
  DROP FOREIGN KEY `MovimientoInventario_prestamoId_fkey`,
  ADD CONSTRAINT `MovimientoInventario_articuloId_immutable_fkey` FOREIGN KEY (`articuloId`) REFERENCES `ArticuloInventario`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `MovimientoInventario_actorId_immutable_fkey` FOREIGN KEY (`actorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `MovimientoInventario_prestamoId_immutable_fkey` FOREIGN KEY (`prestamoId`) REFERENCES `PrestamoInventario`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
