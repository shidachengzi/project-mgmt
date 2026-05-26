-- 系统权限：全员通知、系统配置（服务/邮件）；并授予内置 admin 角色（owner 在代码中拥有全部权限）
INSERT IGNORE INTO `system_permissions` (`id`, `key`, `label`, `createdAt`, `updatedAt`)
VALUES
  ('perm-notification-broadcast', 'notification.broadcast', '全员通知', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('perm-system-config', 'system.config', '系统配置', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT INTO `role_system_permissions` (`roleId`, `permissionId`, `assignedAt`)
SELECT r.`id`, p.`id`, CURRENT_TIMESTAMP(3)
FROM `system_roles` r
CROSS JOIN `system_permissions` p
WHERE r.`key` = 'admin'
  AND p.`key` IN ('notification.broadcast', 'system.config')
  AND NOT EXISTS (
    SELECT 1 FROM `role_system_permissions` rsp
    WHERE rsp.`roleId` = r.`id` AND rsp.`permissionId` = p.`id`
  );
