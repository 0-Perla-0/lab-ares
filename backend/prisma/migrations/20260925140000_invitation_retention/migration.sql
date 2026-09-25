ALTER TABLE `Invitation` ADD COLUMN `archivedAt` DATETIME(3) NULL;
CREATE INDEX `Invitation_archivedAt_idx` ON `Invitation`(`archivedAt`);
