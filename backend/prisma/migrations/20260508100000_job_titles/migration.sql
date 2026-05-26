CREATE TABLE `job_titles` (
  `id` VARCHAR(30) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `job_titles_name_key` (`name`),
  PRIMARY KEY (`id`)
);
