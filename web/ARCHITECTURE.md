# Web 前端目录结构规范

本项目采用 **Feature-Sliced Design（FSD）** 的简化分层，目标是：业务按域拆分、依赖单向向下、页面薄、特性厚。

## 目录总览

```
web/src/
├── app/                    # 应用壳：路由入口、全局样式、Provider
│   ├── App.tsx             # 入口 re-export（main.tsx）
│   ├── router.tsx
│   ├── hooks/useAppBootstrap.ts
│   ├── providers/AppProviders.tsx
│   ├── routes/
│   │   ├── constants.ts    # 路由 tab 与 path 映射
│   │   └── AppRoutes.tsx   # → src/App.tsx
│   └── styles/importGlobalStyles.ts
├── pages/                  # 路由级页面（按业务域分子目录，见下）
├── widgets/                # 复合布局块（主框架侧栏/顶栏）
│   └── main-layout/
├── features/               # 可复用业务能力（admin-console、project-detail、contacts-im…）
├── entities/               # 领域实体：store、类型、配置
│   ├── auth/
│   ├── account/
│   ├── org/
│   ├── project/            # config / lib / model
│   ├── permission/
│   ├── target-feed/
│   └── workspace/          # 后端工作区 bootstrap（原 entities/data）
├── shared/                 # 与业务无关的基础设施
│   ├── api/
│   ├── calendar/
│   ├── constants/
│   ├── hooks/
│   ├── ui/                 # 通用展示组件（优先级、状态 Tag、可拖拽列宽）
│   └── utils/
├── styles/                 # 全局与页面级 CSS（如 styles/pages/login.css）
└── main.tsx
```

## 依赖规则（自上而下）

| 层级 | 可引用 |
|------|--------|
| `app` | pages, widgets, features, entities, shared |
| `pages` | widgets, features, entities, shared |
| `widgets` | features, entities, shared |
| `features` | entities, shared |
| `entities` | shared（**禁止**引用 pages / features） |
| `shared` | 仅第三方库 |

## `pages/` 按域划分

已通过 **子目录 `index.ts` 聚合导出** 建立域边界（实现文件在 `pages/{domain}/` 下）：

| 子目录 | 导出 |
|--------|------|
| `pages/auth/` | LoginPage, ForgotPasswordPage（样式 `styles/pages/login.css`） |
| `pages/projects/` | AllProjectsPage, ProjectDetailPage, TaskManageEditorModal, ActivityParticipantActivity |
| `pages/work/` | WorkbenchPage, MyTasksPage, ReportsPage |
| `pages/calendar/` | CalendarPage, CalendarSettings* |
| `pages/contacts/` | ContactsPage |
| `pages/account/` | AccountSettingsPage |
| `pages/admin/` | AdminConsolePage |

**推荐 import**：`import { AllProjectsPage } from '@/pages/projects'` 或 `from './pages/projects'`。

路由组件保持 **薄**：组合 `features/*` 与 `widgets/*`，不写大段业务逻辑。

## `features/` 现状与待办

| 模块 | 状态 |
|------|------|
| `project-detail/` | 已拆 overview / targets / tasks / gantt / settings；**`ProjectDetailPage` 约 4.6k 行**（概览 Tab UI 在 `overview/ProjectOverviewTabView`），待迁入 `features/project-detail/ProjectDetailPage.tsx` 并由 `pages/projects` 薄 re-export |
| `admin-console/` | members / roles / settings 已拆；AdminConsolePage 仍为壳 |
| `contacts-im/` | IM 相关较完整 |
| `features/ui` | **已废弃**，请使用 `shared/ui` |

## `entities/` 说明

- **`project/model/types.ts`**：`ProjectSummary` 等领域类型（勿再从 Page 导出类型）。
- **`project/config/projectTemplates.ts`**：项目模板与 Tab 文案。
- **`project/lib/`**：personalDesk、projectStorage 等工具。
- **`workspace/model/backendDataStore.ts`**：登录后 bootstrap（项目列表、组织、权限缓存）。

## 数据源约定（后端唯一）

- 日常开发与生产均要求 **`isBackendAuthEnabled()`**（开发留空 `VITE_BACKEND_API_BASE` 走 `/api` 代理，或配置完整 API 地址）。
- 业务数据（项目、目标、任务、成员、工作区、报表、通讯录任务等）**只走后端 API**；`localStorage` 仅保留 UI 偏好（列宽、最近打开任务等）。
- 未配置后端时，`BackendRequiredGate` 阻断主路由；登录页同样提示配置方式。

## 兼容层

- `src/features/ui/*` → 请使用 `shared/ui/*`（旧路径若仍存在 re-export 可删除）

## 巨型文件拆分优先级

1. **`pages/ProjectDetailPage.tsx`**（最高）：按 Tab 将 state/列定义/弹窗迁入 `features/project-detail/{overview,targets,tasks,gantt,settings}/`
2. **`layouts/MainLayout.tsx`**：已拆 `PrimaryNavItem`、`layoutUtils`、`widgets/main-layout/inbox/`（消息抽屉）
3. **`features/admin-console/members/AdminMembersPanel.tsx`**：表格与表单拆子组件


## 本地开发

```bash
cd web && npm run dev
```

构建校验：`npm run build`
