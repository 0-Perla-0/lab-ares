-- Existing deployments may contain one delivery row per attempt. Keep the
-- latest row for each event before enforcing the new one-aggregate contract.
DROP INDEX `EmailDelivery_outboxEventId_attempts_key` ON `EmailDelivery`;
DELETE older FROM `EmailDelivery` older
INNER JOIN `EmailDelivery` newer
  ON older.`outboxEventId` = newer.`outboxEventId`
 AND (older.`createdAt` < newer.`createdAt`
      OR (older.`createdAt` = newer.`createdAt` AND older.`id` < newer.`id`));

ALTER TABLE `EmailDelivery`
  ADD COLUMN `messageId` VARCHAR(180) NULL,
  ADD COLUMN `leaseUntil` DATETIME(3) NULL,
  ADD COLUMN `leaseOwner` VARCHAR(80) NULL;

UPDATE `EmailDelivery`
SET `messageId` = CONCAT('<ares-', `outboxEventId`, '-', `id`, '@ares.local>')
WHERE `messageId` IS NULL;

ALTER TABLE `EmailDelivery` MODIFY COLUMN `messageId` VARCHAR(180) NOT NULL;
CREATE UNIQUE INDEX `EmailDelivery_outboxEventId_key` ON `EmailDelivery`(`outboxEventId`);
CREATE UNIQUE INDEX `EmailDelivery_messageId_key` ON `EmailDelivery`(`messageId`);
CREATE INDEX `EmailDelivery_status_leaseUntil_idx` ON `EmailDelivery`(`status`,`leaseUntil`);
