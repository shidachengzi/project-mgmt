-- 站内 IM：可选附件（文件消息）
ALTER TABLE `im_direct_messages`
  ADD COLUMN `attachmentUrl` VARCHAR(1024) NULL,
  ADD COLUMN `attachmentName` VARCHAR(255) NULL,
  ADD COLUMN `attachmentSize` INT NULL,
  ADD COLUMN `mimeType` VARCHAR(128) NULL;
