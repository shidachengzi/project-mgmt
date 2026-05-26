-- AlterTable
ALTER TABLE `projects` ADD COLUMN `coverKind` VARCHAR(16) NOT NULL DEFAULT 'gradient',
    ADD COLUMN `coverImageData` LONGTEXT NULL;
