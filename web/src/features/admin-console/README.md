# 管理后台 feature

## 目录

- `members/` — 成员与组织（AdminMembersPanel、useAdminOrgSync）
- `roles/` — 项目/系统角色
- `settings/` — 系统邮件、服务等配置
- `notifications/` — 站内广播通知
- `departments/` — 部门（占位 index）

## 入口

- `pages/admin/AdminConsolePage.tsx` → `AdminConsoleFeature`

## 依赖

- `entities/org`、`entities/workspace`、`entities/permission`
- `shared/api`
