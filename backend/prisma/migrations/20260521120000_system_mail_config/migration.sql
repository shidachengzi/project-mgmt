-- 全局 SMTP 配置（单例 id=default）；未配置或 host/from 不全时回退环境变量 SMTP_*
CREATE TABLE `system_mail_config` (
  `id` VARCHAR(32) NOT NULL,
  `smtp_host` VARCHAR(191) NULL,
  `smtp_port` INT NOT NULL DEFAULT 587,
  `smtp_secure` BOOLEAN NOT NULL DEFAULT false,
  `smtp_from` VARCHAR(191) NULL,
  `smtp_user` VARCHAR(191) NULL,
  `smtp_pass_cipher` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
