# Project Mgmt Backend (Phase 1)

Next.js + MySQL backend for authentication and RBAC.

## 1) Setup

1. Copy env:
   - `cp .env.example .env` (Windows 可手动复制)
   - 本地开发示例连接串：`DATABASE_URL="mysql://root:root@127.0.0.1:3306/project_mgmt"`（已写入本仓库的 `backend/.env` 时可直接用）

2. Install dependencies:
   - `npm install`

3. **数据库与 Prisma（按你的情况选一种，不必都跑）**

   **A. 库和表已经就绪**（例如：已 `prisma migrate deploy` 成功，或已导入 `sql/import_project_mgmt_full.sql`）——**不要**再跑 `npm run db:setup:local`。在 `backend/` 只需：

   ```bash
   npx prisma generate
   npm run db:seed
   ```

   。

   **B. 本机从零建库**（无库、无表）可选用一键脚本：
   - `npm run db:setup:local` 或 `scripts/setup-local-db.cmd`
   - 说明：脚本内用 `mysql2` 建库，避免 Prisma 连系统库 `mysql` 触发 **P3004**。

### 迁移失败恢复（如 Error 1071 索引过长）

若曾执行到一半失败，建议在 MySQL 里**删掉库再重来**（本地开发无数据时最简单）：

```sql
DROP DATABASE IF EXISTS project_mgmt;
CREATE DATABASE project_mgmt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

然后按 **3.B** 执行 `npm run db:setup:local`，或先导入 `sql/import_project_mgmt_full.sql` 再按 **3.A** 执行 `generate` +（必要时）`migrate resolve` + `db:seed`。

当前迁移已缩短复合索引相关字段宽度（避免两个 `VARCHAR(191)` 叠在同一索引上）。

仅同步表结构（已有迁移文件、需由 Prisma 执行 SQL）时：

- `npm run db:generate`
- `npm run db:deploy`
- `npm run db:seed`

4. Run server (default 3000):
   - `npm run dev`

### 开始/截止站内提醒（项目概览 + 任务/目标）

- 在计划**开始/截止时刻前若干分钟**写入「项目通知」；默认提前 **10 分钟**，环境变量 **`DEADLINE_REMINDER_LEAD_MINUTES`**（1～10080，单位分钟）。
- 调度实现为 **`node-cron`**（进程内定时执行 `runDeadlineReminderScan`，不再依赖外部 HTTP 轮询；仍可保留 `POST /api/internal/deadline-reminders` 作手动触发）。
- **`npm run dev:stack`**：默认由 **IM 进程**注册 cron（`DEADLINE_REMINDER_IN_IM` 未设为 `false` 时）。间隔由 **`DEADLINE_REMINDER_INTERVAL_MS`**（15000～3600000，默认 60000）映射为 cron 表达式，或用 **`DEADLINE_REMINDER_CRON`** 直接写标准 cron（含 6 段秒字段，如 `0 * * * * *` 每分钟第 0 秒）。
- **仅 `npm run dev` / `next start`（无 IM）**：在 `backend/.env` 设置 **`DEADLINE_REMINDER_IN_NEXT=true`**，由 **Next `instrumentation`** 启动同一套 cron。**与 `dev:stack` 同开时不要两边都扫**：请二选一——要么关掉 IM 侧（`DEADLINE_REMINDER_IN_IM=false`）并开 `IN_NEXT`，要么关 `IN_NEXT` 仅用 IM。
- 外部单次触发（可选）：`POST /api/internal/deadline-reminders`，请求头 **`x-pm-cron-secret`** 与 **`INTERNAL_CRON_SECRET`**（至少 8 字符）一致。
- 本地脚本（可选）：**`scripts/trigger-deadline-reminders.bat`** / **`.sh`** 调上述 HTTP；**`npm run deadline-reminder:once`** 直接连库跑一次（在 `backend/`）。
- **项目概览自定义提醒中的「邮件」**：需配置 **SMTP**（见根目录 `.env.example` 中 `SMTP_HOST`、`SMTP_FROM` 等）。未配置时仅发送系统站内消息。

## 2) Main APIs (Phase 1)

- Auth
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- System RBAC
  - `GET /api/system/permissions/me`
  - `GET /api/system/roles`
  - `PUT /api/system/roles/:roleId/permissions`
- Project RBAC
  - `GET /api/projects/:projectId/permissions/me`
  - `GET /api/projects/:projectId/roles`
  - `PUT /api/projects/:projectId/roles/:roleId/permissions`
  - `PUT /api/projects/:projectId/members/:userId/role`

## 3) Minimal HTTP examples

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"account\":\"owner@example.com\",\"password\":\"123456\"}" \
  -c cookies.txt
```

### Fetch current system permissions

```bash
curl http://localhost:3000/api/system/permissions/me -b cookies.txt
```

### Fetch current project permissions

```bash
curl http://localhost:3000/api/projects/demo-project/permissions/me -b cookies.txt
```

### Update one project member role

```bash
curl -X PUT http://localhost:3000/api/projects/demo-project/members/<userId>/role \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"roleKey\":\"normal\"}"
```
