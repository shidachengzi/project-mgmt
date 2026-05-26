-- CreateTable
CREATE TABLE `user_calendars` (
    `id` VARCHAR(30) NOT NULL,
    `ownerUserId` VARCHAR(30) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(32) NOT NULL,
    `visibility` VARCHAR(32) NOT NULL,
    `memberIds` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_calendars_ownerUserId_name_key`(`ownerUserId`, `name`),
    INDEX `user_calendars_ownerUserId_idx`(`ownerUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_calendar_events` (
    `id` VARCHAR(30) NOT NULL,
    `calendarId` VARCHAR(30) NOT NULL,
    `ownerUserId` VARCHAR(30) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `allDay` BOOLEAN NOT NULL DEFAULT false,
    `repeatRule` TEXT NULL,
    `participantIds` JSON NOT NULL,
    `location` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `reminders` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `user_calendar_events_calendarId_idx`(`calendarId`),
    INDEX `user_calendar_events_ownerUserId_idx`(`ownerUserId`),
    INDEX `user_calendar_events_startAt_idx`(`startAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_calendars` ADD CONSTRAINT `user_calendars_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_calendar_events` ADD CONSTRAINT `user_calendar_events_calendarId_fkey` FOREIGN KEY (`calendarId`) REFERENCES `user_calendars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_calendar_events` ADD CONSTRAINT `user_calendar_events_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
