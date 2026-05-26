-- 任务/目标创建人，用于「我创建的」列表；负责人索引加速「我负责的」查询
ALTER TABLE `project_tasks`
ADD COLUMN `createdByUserId` VARCHAR(30) NULL,
ADD INDEX `project_tasks_createdByUserId_idx` (`createdByUserId`),
ADD INDEX `project_tasks_ownerUserId_idx` (`ownerUserId`),
ADD CONSTRAINT `project_tasks_createdByUserId_fkey`
  FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
