-- CreateTable
CREATE TABLE `im_direct_messages` (
    `id` VARCHAR(30) NOT NULL,
    `fromUserId` VARCHAR(30) NOT NULL,
    `toUserId` VARCHAR(30) NOT NULL,
    `clientMsgId` VARCHAR(128) NOT NULL,
    `text` VARCHAR(8000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `im_direct_messages_fromUserId_clientMsgId_key`(`fromUserId`, `clientMsgId`),
    INDEX `im_direct_messages_toUserId_createdAt_idx`(`toUserId`, `createdAt`),
    INDEX `im_direct_messages_pair_createdAt_idx`(`fromUserId`, `toUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
