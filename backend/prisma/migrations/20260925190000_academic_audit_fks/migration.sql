ALTER TABLE `AdscripcionAcademica`
  ADD CONSTRAINT `AdscripcionAcademica_solicitadoPorId_fkey` FOREIGN KEY (`solicitadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `AdscripcionAcademica_confirmadoPorId_fkey` FOREIGN KEY (`confirmadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
