-- AlterTable：兼容不支持 JSON 列 `DEFAULT ('{}')` / `DEFAULT (JSON_OBJECT())` 的 MySQL / MariaDB
ALTER TABLE `user_calendars` ADD COLUMN `memberAccess` JSON NULL;

UPDATE `user_calendars` SET `memberAccess` = CAST('{}' AS JSON) WHERE `memberAccess` IS NULL;

ALTER TABLE `user_calendars` MODIFY COLUMN `memberAccess` JSON NOT NULL;
