# 项目管理系统

前后端分离的团队项目管理 Web 应用：项目与任务、目标与甘特图、日历、通讯录与即时消息、工作台与报表，以及系统/项目两级 RBAC 权限与管理后台。

| 模块            | 技术栈                                                    | 默认端口         |
| --------------- | --------------------------------------------------------- | ---------------- |
| 前端 `web/`     | React 18、Vite 6、Ant Design 5、Zustand、Socket.IO Client | **5173**（开发） |
| 后端 `backend/` | Next.js 15（API Routes）、Prisma、MySQL、JWT Cookie 会话  | **3000**（API）  |
| IM 服务         | 独立 Socket.IO 进程（`dev:stack` 一并启动）               | **3001**         |

更细的后端 API 与数据库说明见 [backend/README.md](backend/README.md)；前端目录规范见 [web/ARCHITECTURE.md](web/ARCHITECTURE.md)。

## 界面预览

<!--
![登录页](docs/images/login.png)
![工作台](docs/images/workbench.png)
![项目详情](docs/images/project-detail.png)
-->
> <p align="center"><img src="docs/images/project.png" alt="" width="720" /><p>
> <p align="center"><img src="docs/images/task.png" alt="" width="720" /></p>
> <p align="center"><img src="docs/images/report.png" alt="" width="720" /></p>
> <p align="center"><img src="docs/images/detail.png" alt="" width="720" /></p>

---

## 功能概览

- **项目**：公开/私有项目、模板、概览、工作区动态与附件
- **目标 / 任务 / 甘特图**：项目内目标管理、任务树、表格筛选排序、甘特视图
- **权限**：系统角色（所有者/管理员/成员）与项目内角色、细粒度项目权限
- **协作**：工作台、我的任务、报表、日历（个人/共享）、站内通知
- **组织**：部门、职务、成员管理、管理后台（角色、系统配置、广播通知）
- **通讯录 & IM**：一对一即时消息（需启动 IM Socket 服务）
- **提醒**：任务/目标开始与截止的站内提醒；可选 SMTP 邮件（系统配置或环境变量）

---

## 环境要求

- **Node.js** 18+（推荐 20 LTS）
- **npm** 9+
- **MySQL** 8.0+（或兼容的 MariaDB，字符集 `utf8mb4`）

---

## 快速开始（本地开发）

以下命令均在仓库根目录说明；实际请在对应子目录执行 `npm` 命令。

### 1. 克隆仓库

```bash
git clone https://github.com/shidachengzi/project-mgmt.git
cd project-mgmt
```

本地示例账号（与 `backend/.env.example` 一致，可按实际修改）：

`mysql://root:root@127.0.0.1:3306/project_mgmt`

### 2. 后端

```bash
cd backend
cp .env.example .env    # Windows 可手动复制为 .env
npm install
```

**数据库初始化（二选一）：**

| 场景                                    | 命令                                      |
| --------------------------------------- | ----------------------------------------- |
| **本机从零**（无库、无表）              | `npm run db:setup:local`                  |
| **库表已存在**（已 migrate 或导入 SQL） | `npx prisma generate` → `npm run db:seed` |

`db:setup:local` 会：建库 → `prisma generate` → `migrate deploy` → `seed`。

启动 **API + IM**（推荐，通讯录 IM 与截止提醒调度可用）：

```bash
npm run dev:stack
```

仅 API（无 IM）：

```bash
npm run dev
```

此时若需要截止提醒且未跑 IM 栈，在 `.env` 中设置 `DEADLINE_REMINDER_IN_NEXT=true`（详见 [backend/README.md](backend/README.md)）。

### 3. 前端

新开终端：

```bash
cd web
cp .env.example .env    # 开发可保持 VITE_BACKEND_API_BASE 为空，走 Vite 代理
npm install
npm run dev
```

浏览器访问：**http://localhost:5173**

开发模式下，`/api` 与 `/im-uploads` 由 Vite 代理到 `http://localhost:3000`，`/socket.io` 代理到 `http://localhost:3001`（见 `web/vite.config.ts`）。

### 5. 默认登录账号

执行 `db:seed` 后会创建系统所有者（密码已哈希，明文如下）：

| 字段 | 值                  |
| ---- | ------------------- |
| 邮箱 | `owner@example.com` |
| 密码 | `123456`            |

**首次登录后请立即修改密码。** 生产环境切勿使用种子默认密码。

---

## 生产部署（概要）

### 后端

```bash
cd backend
# 配置 .env：DATABASE_URL、JWT_*、COOKIE_* 等，生产务必更换密钥
npm install
npx prisma generate
npm run db:deploy
npm run db:seed          # 仅首次或需要种子数据时
npm run build
npm run start:stack      # 或分别部署 API 与 IM 进程
```

### 前端

构建前在 `web/.env.production`（或 CI 环境变量）中配置：

```env
VITE_BACKEND_API_BASE=https://你的-api-域名
VITE_IM_SOCKET_BASE=https://你的-im-域名
```

```bash
cd web
npm install
npm run build
```

将 `web/dist` 部署到 Nginx、CDN 或静态托管；需保证浏览器能访问上述 API / IM 地址（CORS、Cookie `COOKIE_DOMAIN` 需与部署域名一致）。

Cookie 相关生产配置见 `backend/.env.example` 中的 `COOKIE_DOMAIN`、`COOKIE_SECURE`。

---

## 环境变量

### 后端 `backend/.env`

| 变量                                               | 说明                                 |
| -------------------------------------------------- | ------------------------------------ |
| `DATABASE_URL`                                     | MySQL 连接串                         |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`         | JWT 签名密钥（生产必须更换）         |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | 访问/刷新令牌有效期                  |
| `COOKIE_DOMAIN` / `COOKIE_SECURE`                  | 跨子域 Cookie 与 HTTPS               |
| `SMTP_*`                                           | 可选，邮件提醒（也可在管理后台配置） |
| `DEADLINE_REMINDER_*`                              | 截止/开始提醒 cron 与扫描间隔        |
| `INTERNAL_CRON_SECRET`                             | 手动触发提醒 HTTP 接口的密钥         |
| `IM_SOCKET_PORT`                                   | IM 端口，默认 `3001`                 |
| `IM_RETENTION_DAYS`                                | IM 消息保留天数                      |

完整示例见 [backend/.env.example](backend/.env.example)。

### 前端 `web/.env`

| 变量                          | 说明                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| `VITE_BACKEND_API_BASE`       | 生产：后端完整 Origin；开发留空走代理                      |
| `VITE_IM_SOCKET_BASE`         | 生产：IM Socket Origin；开发留空走代理                     |
| `VITE_BACKEND_PROXY_TARGET`   | 仅开发：Vite `/api` 代理目标，默认 `http://localhost:3000` |
| `VITE_IM_SOCKET_PROXY_TARGET` | 仅开发：WebSocket 代理目标，默认 `http://localhost:3001`   |

示例见 [web/.env.example](web/.env.example)。

---

## 仓库结构

```
project-mgmt/
├── web/                 # React 前端（Vite）
│   └── src/
│       ├── app/         # 路由、Provider
│       ├── pages/       # 页面（auth、projects、work、calendar…）
│       ├── features/    # 业务特性（project-detail、admin-console、contacts-im）
│       ├── entities/    # 领域模型与 store
│       └── shared/      # API 客户端、工具、通用 UI
├── backend/             # Next.js API + Prisma
│   ├── app/api/         # REST API
│   ├── prisma/          # Schema、迁移、seed
│   └── src/im/          # Socket.IO IM 服务
└── README.md            # 本文件
```

---

## 常用脚本

### 后端（在 `backend/` 目录）

| 命令                                    | 说明                         |
| --------------------------------------- | ---------------------------- |
| `npm run dev`                           | 仅 Next API（:3000）         |
| `npm run dev:stack`                     | API + IM（:3000 + :3001）    |
| `npm run db:setup:local`                | 本地一键建库、迁移、种子     |
| `npm run db:seed`                       | 写入系统权限、角色、默认用户 |
| `npm run db:deploy`                     | 生产环境执行迁移             |
| `npm run build` / `npm run start:stack` | 生产构建与启动               |

### 前端（在 `web/` 目录）

| 命令              | 说明               |
| ----------------- | ------------------ |
| `npm run dev`     | 开发服务器 :5173   |
| `npm run build`   | 生产构建 → `dist/` |
| `npm run preview` | 本地预览构建结果   |

---

## 常见问题

### 迁移失败（如 MySQL Error 1071 索引过长）

本地无重要数据时，可删库重建后重新执行 `npm run db:setup:local`：

```sql
DROP DATABASE IF EXISTS project_mgmt;
CREATE DATABASE project_mgmt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 登录后接口 401

确认前端能访问后端：开发时后端需在 **3000** 运行，且 `web` 的代理配置正确；生产检查 `VITE_BACKEND_API_BASE` 与 Cookie 域名。

### IM / 通讯录消息不通

需使用 `npm run dev:stack`（或单独启动 IM 进程），并确认 **3001** 端口未被占用；前端开发代理依赖 `vite.config.ts` 中的 `/socket.io`。

### 邮件提醒不发送

在管理后台 **系统配置 → 邮件** 配置 SMTP，或在 `backend/.env` 中配置 `SMTP_*`。未配置时仅发送站内系统消息。

---

## 开源与安全提示

- **不要** 将 `backend/.env`、`web/.env` 等含密钥的文件提交到 Git；仓库已提供 `.env.example`。
- 发布前请更换所有 `JWT_*` 密钥与 `INTERNAL_CRON_SECRET`，并修改种子用户密码。
- 若需指定开源协议，请在仓库根目录添加 `LICENSE` 文件（如 MIT、Apache-2.0）。

---

## 参与贡献

1. Fork 本仓库并创建功能分支
2. 在 `web/` 与 `backend/` 分别跑通开发与基础流程
3. 提交 Pull Request 并说明变更范围

问题与建议请使用 GitHub Issues。

---

## 相关文档

- [backend/README.md](backend/README.md) — 数据库、迁移、提醒调度、Phase 1 API 示例
- [web/ARCHITECTURE.md](web/ARCHITECTURE.md) — 前端 FSD 分层与目录约定
- [web/src/pages/README.md](web/src/pages/README.md) — 页面模块索引
