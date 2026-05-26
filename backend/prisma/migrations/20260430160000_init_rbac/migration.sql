-- Phase 1: auth + RBAC schema (MySQL)
-- 索引长度兼容：utf8mb4 下复合唯一/主键避免双 VARCHAR(191)（小皮等环境 max key ~1000 bytes → Error 1071）

CREATE TABLE `users` (
  `id` VARCHAR(30) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NULL,
  `mobile` VARCHAR(191) NULL,
  `passwordHash` VARCHAR(128) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'active',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `users_email_key` (`email`),
  UNIQUE INDEX `users_mobile_key` (`mobile`),
  PRIMARY KEY (`id`)
);

CREATE TABLE `system_roles` (
  `id` VARCHAR(30) NOT NULL,
  `key` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `system_roles_key_key` (`key`),
  PRIMARY KEY (`id`)
);

CREATE TABLE `system_permissions` (
  `id` VARCHAR(30) NOT NULL,
  `key` VARCHAR(128) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `system_permissions_key_key` (`key`),
  PRIMARY KEY (`id`)
);

CREATE TABLE `user_system_roles` (
  `userId` VARCHAR(30) NOT NULL,
  `roleId` VARCHAR(30) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userId`, `roleId`)
);

CREATE TABLE `role_system_permissions` (
  `roleId` VARCHAR(30) NOT NULL,
  `permissionId` VARCHAR(30) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`roleId`, `permissionId`)
);

CREATE TABLE `projects` (
  `id` VARCHAR(36) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `visibility` VARCHAR(32) NOT NULL DEFAULT 'private',
  `ownerUserId` VARCHAR(30) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE `project_roles` (
  `id` VARCHAR(30) NOT NULL,
  `projectId` VARCHAR(36) NOT NULL,
  `key` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `note` VARCHAR(191) NULL,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `project_roles_projectId_key_key` (`projectId`, `key`),
  PRIMARY KEY (`id`)
);

CREATE TABLE `project_permissions` (
  `id` VARCHAR(30) NOT NULL,
  `projectId` VARCHAR(36) NOT NULL,
  `key` VARCHAR(214) NOT NULL,
  `sectionTitle` VARCHAR(64) NOT NULL,
  `itemLabel` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `project_permissions_projectId_key_key` (`projectId`, `key`),
  PRIMARY KEY (`id`)
);

CREATE TABLE `project_members` (
  `id` VARCHAR(30) NOT NULL,
  `projectId` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(30) NOT NULL,
  `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `project_members_projectId_userId_key` (`projectId`, `userId`),
  PRIMARY KEY (`id`)
);

CREATE TABLE `project_member_roles` (
  `memberId` VARCHAR(30) NOT NULL,
  `roleId` VARCHAR(30) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`memberId`, `roleId`)
);

CREATE TABLE `project_role_permissions` (
  `roleId` VARCHAR(30) NOT NULL,
  `permissionId` VARCHAR(30) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`roleId`, `permissionId`)
);

CREATE TABLE `sessions` (
  `id` VARCHAR(30) NOT NULL,
  `userId` VARCHAR(30) NOT NULL,
  `refreshToken` VARCHAR(250) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `sessions_refreshToken_key` (`refreshToken`),
  PRIMARY KEY (`id`)
);

ALTER TABLE `user_system_roles` ADD CONSTRAINT `user_system_roles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `user_system_roles` ADD CONSTRAINT `user_system_roles_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `system_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `role_system_permissions` ADD CONSTRAINT `role_system_permissions_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `system_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `role_system_permissions` ADD CONSTRAINT `role_system_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `system_permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_roles` ADD CONSTRAINT `project_roles_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_permissions` ADD CONSTRAINT `project_permissions_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_member_roles` ADD CONSTRAINT `project_member_roles_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `project_members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_member_roles` ADD CONSTRAINT `project_member_roles_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `project_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_role_permissions` ADD CONSTRAINT `project_role_permissions_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `project_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_role_permissions` ADD CONSTRAINT `project_role_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `project_permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
