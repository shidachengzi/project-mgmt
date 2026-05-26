# Pages 层

按业务域分子目录，**实现文件在子目录内**，通过 `index.ts` 统一导出。

```ts
import { LoginPage } from './pages/auth'
import { AllProjectsPage, ProjectDetailPage } from './pages/projects'
import { MyTasksPage, WorkbenchPage } from './pages/work'
```

| 目录 | 页面 |
|------|------|
| `auth/` | LoginPage, ForgotPasswordPage, AnimatedCharacters（样式 `styles/pages/login.css`） |
| `projects/` | AllProjectsPage, ProjectDetailPage；`TaskManageEditorModal`、`ActivityParticipantActivity` 为兼容 re-export（实现见 `features/project-detail`） |
| `work/` | WorkbenchPage, MyTasksPage, ReportsPage |
| `calendar/` | CalendarPage, CalendarSettings* |
| `contacts/` | ContactsPage |
| `account/` | AccountSettingsPage |
| `admin/` | AdminConsolePage |

根目录下的 `*Page.tsx` 桩文件已移除；请始终从 `pages/{domain}` 导入。
