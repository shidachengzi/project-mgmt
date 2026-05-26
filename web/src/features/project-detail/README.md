# 项目详情 feature

## 目录

- `overview/` — 项目概览 Tab
- `targets/` — 目标管理 Tab（`ProjectTargetsTab`、`ProjectTargetEditorModal`、`useProjectTargetCrud`、`useTargetTablePipeline`、表格列/筛选/排序）
- `tasks/` — 任务管理 Tab（`taskTypes`、`TaskManageEditorModal`、`useProjectTaskCrud`、`useTaskTablePipeline`、`projectTasksLoader`、`taskManageTableColumns`、筛选/排序/分组、`projectTaskAdapter`）
- `gantt/` — 甘特图 Tab（`ProjectGanttTab`、`useProjectGanttData`、`useProjectGanttFilters`、`ganttTableFilters`）
- `settings/` — 更多设置 Tab（`projectSettingsTypes`、`ProjectSettingsTab`、成员管理）
- `shared/` — Tab 间共享 UI（只读提示条、分组下拉、`activityParticipantActivity`、`workspaceAttachmentUtils`）
- `hooks/` — 只读态、权限、工作区、设置元数据、三级附件、详情页数据加载、编辑器导航、侧栏 feed 切片
- `workspace/` — 工作区 PATCH 载荷解析（`parseWorkspacePayload`）

## 入口

- 路由页：`pages/projects/ProjectDetailPage.tsx` → `features/project-detail/ProjectDetailPage.tsx`
- 实现集中在 `ProjectDetailPage.tsx`；领域逻辑按 Tab 分布在子目录

## settings/ 补充

| 文件 | 作用 |
|------|------|
| `useProjectMemberManagement.tsx` | 成员列表同步、添加/改角色/移除、`memberColumns`、`ProjectAddMemberModal` |
| `useProjectRoleManagement.ts` | 项目角色列表、权限 Map、默认角色、删除自定义角色、添加角色与保存权限 |
| `projectRoleDefaults.ts` | `ProjectRoleItem`、内置/自定义角色判断、默认成员角色 key |
| `ProjectAddMemberModal.tsx` | 添加成员弹窗 UI |
| `projectMemberRole.ts` | `ProjectMemberRecord`、角色 key/label、`mapBackendMemberRows` |

## targets/ 补充

| 文件 | 作用 |
|------|------|
| `useProjectTargetCrud.ts` | 目标编辑、描述提交、删除、评论、新建目标 |
| `useTargetRelatedTasks.ts` | 目标「关联任务」选择器状态与确认/取消逻辑 |
| `useTargetTablePipeline.tsx` | 目标表筛选/排序/分组、筛选面板控件、`filteredTargets` / `targetDisplayRows` |
| `targetActivityCompletedAt.ts` | 活动流中状态变更时间（完成时间筛选） |
| `ProjectTargetEditorModal.tsx` | 目标详情弹窗 |

## hooks/ 补充

| 文件 | 作用 |
|------|------|
| `useProjectDetailWorkspace.ts` | 概览/工作区状态、hydration、`appendOverviewActivityEntries`、关联任务与附件 Map |
| `useWorkspaceAttachments.ts` | 目标/任务/项目三级附件增删与下载，项目级写入概览活动 |
| `useProjectDetailPermissions.ts` | 项目内权限门控 |
| `useProjectDetailReadonly.ts` | 归档/公开项目只读 |
| `useProjectSettingsMeta.ts` | 设置 Tab 元数据与 PATCH |
| `useProjectDetailDataLoad.ts` | 项目详情/任务树加载、归档态、`projectServerAudit` |
| `useProjectDetailEditors.ts` | 外部跳转打开编辑器、最近任务、`openTaskDetailByKey` 等 |
| `useTargetSidePanel.ts` | 目标/任务编辑器侧栏评论/活动/流转分页切片 |
| `useProjectDetailModals.tsx` | 目标/任务（含子任务）详情弹窗 JSX 组装 |

## tasks/ 补充

| 文件 | 作用 |
|------|------|
| `TaskManageEditorModal.tsx` | 任务/子任务详情弹窗 |
| `useProjectTaskCrud.ts` | 任务树加载、行内编辑、新建/删除任务与子任务 |
| `useTaskTablePipeline.tsx` | 任务表筛选/排序/分组、`taskRows` / `taskCount`、展开 keys |
| `taskManageListUtils.ts` | 扁平化、统计、`buildTaskEditorSubtasks` |
| `taskTypes.ts` | `TaskManageRecord`、`TaskEditorSubtask`、`CreateSubtaskOptions` 等 |

## pages 兼容层

以下仍从 `pages/projects/` re-export，新代码请从本 feature 导入：

- `TaskManageEditorModal` → `features/project-detail/tasks`
- `ActivityParticipantActivity` → `features/project-detail/shared/activityParticipantActivity`

## 依赖

- `entities/project`、`entities/permission`、`entities/target-feed`
- `shared/api`、`shared/ui`
