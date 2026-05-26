-- 找回密码：邮箱验证码记录
CREATE TABLE `password_reset_codes` (
  `id` VARCHAR(30) NOT NULL,
  `userId` VARCHAR(30) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `codeHash` VARCHAR(128) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `password_reset_codes_userId_createdAt_idx` (`userId`, `createdAt`),
  INDEX `password_reset_codes_email_createdAt_idx` (`email`, `createdAt`),
  CONSTRAINT `password_reset_codes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
