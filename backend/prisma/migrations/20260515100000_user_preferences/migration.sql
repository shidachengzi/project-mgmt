-- AlterTable
-- users.preferences：用户偏好 JSON（含「我的任务」看板 myTasksBoardV2 等）
ALTER TABLE `users` ADD COLUMN `preferences` JSON NULL;
