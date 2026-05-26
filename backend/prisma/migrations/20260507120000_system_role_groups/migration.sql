-- 系统角色分组 + 角色备注 / 分组外键

CREATE TABLE `system_role_groups` (
  `id` VARCHAR(30) NOT NULL,
  `key` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `system_role_groups_key_key` (`key`),
  PRIMARY KEY (`id`)
);

ALTER TABLE `system_roles`
  ADD COLUMN `note` VARCHAR(191) NULL,
  ADD COLUMN `groupId` VARCHAR(30) NULL;

ALTER TABLE `system_roles`
  ADD CONSTRAINT `system_roles_groupId_fkey`
  FOREIGN KEY (`groupId`) REFERENCES `system_role_groups`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `system_role_groups` (`id`, `key`, `name`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT 'seed-srg-default', 'default', '默认', 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `system_role_groups` WHERE `key` = 'default');

INSERT INTO `system_role_groups` (`id`, `key`, `name`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT 'seed-srg-job', 'job', '职务', 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `system_role_groups` WHERE `key` = 'job');

UPDATE `system_roles` sr
INNER JOIN `system_role_groups` g ON g.`key` = 'default'
SET sr.`groupId` = g.`id`
WHERE sr.`key` IN ('owner', 'admin', 'member') AND sr.`groupId` IS NULL;
