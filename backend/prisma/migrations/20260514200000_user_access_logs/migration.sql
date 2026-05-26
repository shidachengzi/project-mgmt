-- 用户访问日志（页面导航、登录等）
CREATE TABLE `user_access_logs` (
  `id` VARCHAR(30) NOT NULL,
  `userId` VARCHAR(30) NOT NULL,
  `path` VARCHAR(512) NOT NULL,
  `userAgent` VARCHAR(8000) NULL,
  `ip` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `user_access_logs_userId_createdAt_idx` (`userId`, `createdAt`),
  CONSTRAINT `user_access_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
