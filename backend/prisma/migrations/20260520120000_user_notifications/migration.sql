-- 站内通知：按用户落库，支持已读/类型筛选
CREATE TABLE `user_notifications` (
  `id` VARCHAR(30) NOT NULL,
  `userId` VARCHAR(30) NOT NULL,
  `category` VARCHAR(16) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` TEXT NULL,
  `readAt` DATETIME(3) NULL,
  `projectId` VARCHAR(36) NULL,
  `taskId` VARCHAR(30) NULL,
  `eventId` VARCHAR(30) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `user_notifications_user_created_idx` (`userId`, `createdAt`),
  INDEX `user_notifications_user_cat_read_idx` (`userId`, `category`, `readAt`),
  CONSTRAINT `user_notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
