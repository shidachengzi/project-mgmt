import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Form } from 'antd'
import type { ProjectSummary } from '../../entities/project/model/types'
import { useTargetFeedStore } from '../../entities/target-feed/model/useTargetFeedStore'
import { isBackendPersonalDeskProjectId, PERSONAL_DESK_PROJECT_ID } from '../../entities/project/lib/personalDesk'
import { DEFAULT_TASK_STAGE_TITLES, getProjectTemplateConfig } from '../../entities/project/config/projectTemplates'
import { ProjectSettingsTab, useProjectMemberManagement, useProjectRoleManagement, type ProjectMemberRecord } from './settings'
import { ProjectGanttTab, useProjectGanttData } from './gantt'
import { ProjectOverviewTab, ProjectOverviewTabSkeleton, ProjectOverviewTabView } from './overview'
import { useProjectOverviewTab, type UseProjectOverviewTabResult } from './overview/useProjectOverviewTab'
import { ProjectTargetsTab, buildTargetTableColumns, type TargetColKey, DEFAULT_TARGET_COL_WIDTHS, TARGET_TABLE_EXPAND_COLUMN_SCROLL_PX, useProjectTargetCrud, useTargetRelatedTasks, useTargetTablePipeline } from './targets'
import type { TargetEditorTab, TargetRecord, TargetStatus } from './targets/targetTypes'

export type { TargetRecord, TargetStatus }
import { useCollaborativeProjectSync, useProjectDetailDataLoad, useProjectDetailEditors, useProjectDetailPermissions, useProjectDetailReadonly, useProjectDetailWorkspace, useProjectSettingsMeta, useProjectDetailModals, useTargetSidePanel, useWorkspaceAttachments, type WorkspaceActivityRecord } from './hooks'
import { fetchProjectDetail } from '../../shared/api/projectsApi'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { acknowledgeCollaborativeRemoteRevision, markCollaborativeLocalMutation } from '../../shared/lib/collaborativeSyncNotify'
import { ProjectReadonlyBanner } from './shared'
import { ProjectTasksTab, buildTaskManageColumns, buildTaskEditorSubtasks, flattenTaskManageRows, DEFAULT_TASK_MANAGE_COL_WIDTHS, TASK_MANAGE_EXPAND_COLUMN_SCROLL_PX, useProjectTaskCrud, useTaskTablePipeline, type TaskEditorTab, type TaskManageColKey, type TaskManageRecord } from './tasks'
import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { useOrgStore } from '../../entities/org/model/useOrgStore'
import { useHasSystemPermission } from '../../entities/permission/systemPermissions'
import { PROJECT_PERMISSION_SECTIONS } from '../../entities/permission/projectPermissionMap'
import { useBackendDataStore } from '../../entities/workspace/model/backendDataStore'
import { type EntityDateValidationMode } from './projectDateValidation'
import { readStoredColumnWidths } from '../../shared/ui/resizableColumnTitle'

type ProjectDetailPageProps = {
  project: ProjectSummary
  activeTab?: '项目概览' | '目标管理' | '任务管理' | '甘特图' | '更多设置'
  onBack?: () => void
  onUpdateProject?: (project: ProjectSummary) => void
  onDeleteProject?: (project: ProjectSummary) => void
  /** When set (e.g. from「我的任务」), opens the matching target/task editor after local data hydrates. */
  detailFromExternal?: { kind: 'target' | 'task'; key: string } | null
  /** Called when the user closes an editor opened via `detailFromExternal` (parent should unmount the bridge). */
  onExternalDetailClose?: () => void
}

type MemberRecord = ProjectMemberRecord

/** Zustand `useSyncExternalStore` 要求 selector 在无数据时使用稳定引用；勿写 `?? []`（每次新建数组会触发无限渲染）。 */
const EMPTY_PROJECT_PERMISSION_KEYS: string[] = []

type SettingsMenuKey = 'member' | 'role' | 'basic' | 'advanced'

type TargetSideTab = '评论' | '活动' | '流转' | '状态审批'

/** 目标详情侧栏「评论 / 活动 / 流转」列表默认展示条数 */
type TargetActivityRecord = WorkspaceActivityRecord

export function ProjectDetailPage({ project, activeTab = '项目概览', onUpdateProject, onDeleteProject, detailFromExternal, onExternalDetailClose }: ProjectDetailPageProps) {
  const templateConfig = useMemo(() => getProjectTemplateConfig(project.templateId), [project.templateId])
  const targetTypeLabel = templateConfig.targetTypeLabel
  const taskTypeLabel = templateConfig.taskTypeLabel
  /** 任务阶段顺序：列表始终按此顺序展示阶段行，任务按 stage 归入对应阶段 */
  const taskStageOptionTitles = useMemo(() => (templateConfig.taskStageTitles.length ? [...templateConfig.taskStageTitles] : [...DEFAULT_TASK_STAGE_TITLES]), [templateConfig.taskStageTitles])
  const isPersonalDeskProject = isBackendPersonalDeskProjectId(project.id) || project.id === PERSONAL_DESK_PROJECT_ID
  const entityDateValidationMode: EntityDateValidationMode = isPersonalDeskProject ? 'startEndOrderOnly' : 'withinProjectWindow'
  /** 甘特图：展开层级 1=仅父任务，≥2 含子任务（当前数据最深为 2） */
  const [ganttExpandLevel, setGanttExpandLevel] = useState(1)
  /** 甘特图：平铺列表 vs 树状缩进 */
  const [ganttDisplayMode, setGanttDisplayMode] = useState<'flat' | 'tree'>('tree')

  const serverUpdatedAtRef = useRef<string | null>(null)
  const lastLocalMutationAtRef = useRef(0)
  const bumpCollaborativeLocalMutation = useCallback(() => {
    markCollaborativeLocalMutation(lastLocalMutationAtRef)
  }, [])
  const { targetList, setTargetList, taskManageList, setTaskManageList, isTargetHydrated, isTaskManageHydrated, isProjectArchived, setIsProjectArchived, projectServerAudit, setProjectServerAudit, reloadProjectTasksFromServer } = useProjectDetailDataLoad({
    project,
    targetTypeLabel,
    taskStageOptionTitles,
    onUpdateProject,
    serverUpdatedAtRef
  })
  const [editingTarget, setEditingTarget] = useState<TargetRecord | null>(null)
  const [editingTargetField, setEditingTargetField] = useState<'title' | 'status' | 'owner' | 'startDate' | 'endDate' | 'priority' | 'metricUnit' | 'metricStart' | 'metricTarget' | 'metricCurrent' | 'acceptanceCriteria' | 'deliveryNote' | 'acceptanceFeedback' | 'description' | null>(null)
  const [targetDescriptionDraft, setTargetDescriptionDraft] = useState<string>('')
  const [editingTask, setEditingTask] = useState<TaskManageRecord | null>(null)
  const [editingChildTask, setEditingChildTask] = useState<TaskManageRecord | null>(null)
  const [members, setMembers] = useState<MemberRecord[]>([])
  const [targetSideTab, setTargetSideTab] = useState<TargetSideTab>('评论')
  const [targetCommentInput, setTargetCommentInput] = useState('')
  const [taskEditorTab, setTaskEditorTab] = useState<TaskEditorTab>('任务信息')
  const [editorTab, setEditorTab] = useState<TargetEditorTab>('任务信息')
  const [tableEditingCell, setTableEditingCell] = useState<{
    key: string
    field: 'status' | 'owner' | 'priority' | 'start' | 'end'
  } | null>(null)

  const targetColStorageKey = `pm-target-col-widths-${project.id}`
  const [targetColWidths, setTargetColWidths] = useState<Record<TargetColKey, number>>(() => readStoredColumnWidths(targetColStorageKey, DEFAULT_TARGET_COL_WIDTHS))
  const taskColStorageKey = `pm-task-col-widths-${project.id}`
  const [taskColWidths, setTaskColWidths] = useState<Record<TaskManageColKey, number>>(() => readStoredColumnWidths(taskColStorageKey, DEFAULT_TASK_MANAGE_COL_WIDTHS))

  useEffect(() => {
    try {
      localStorage.setItem(targetColStorageKey, JSON.stringify(targetColWidths))
    } catch {
      // ignore
    }
  }, [targetColStorageKey, targetColWidths])

  useEffect(() => {
    try {
      localStorage.setItem(taskColStorageKey, JSON.stringify(taskColWidths))
    } catch {
      // ignore
    }
  }, [taskColStorageKey, taskColWidths])

  const [hideCompletedRelated, setHideCompletedRelated] = useState(false)
  const [createTargetModalOpen, setCreateTargetModalOpen] = useState(false)
  const [createTargetContinue, setCreateTargetContinue] = useState(false)
  const [createTargetForm] = Form.useForm()
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false)
  const [createTaskContinue, setCreateTaskContinue] = useState(false)
  const [createTaskForm] = Form.useForm()
  const [settingsMenuKey, setSettingsMenuKey] = useState<SettingsMenuKey>('member')
  const [settingsSelectedMemberKeys, setSettingsSelectedMemberKeys] = useState<string[]>([])
  const authedUserId = useAuthStore(s => s.authedUserId)
  const canCreatePublicProject = useHasSystemPermission('project.create_public')
  const backendFlatPerms = useBackendDataStore(s => s.myProjectPermissionKeys[project.id] ?? EMPTY_PROJECT_PERMISSION_KEYS)
  const backendMemberRows = useBackendDataStore(s => s.membersRowsByProject[project.id])
  const backendRolesDetailed = useBackendDataStore(s => s.projectRolesDetailed[project.id])

  const localMyTaskOwnerLabel = useMemo(() => {
    if (!authedUserId) return ''
    return members.find(m => m.key === authedUserId)?.name ?? ''
  }, [authedUserId, members])

  const projectVisibilityForReadonly = project.backendVisibility === 'public' ? ('公开（企业所有成员）' as const) : ('私有（仅加入的项目成员）' as const)

  const { isProjectReadonlyByRole, isPublicProjectReadonlyBySystem, projectReadonly, projectReadonlyByPermission, readonlyBlockStyle, ensureProjectEditable, ensureProjectMemberCommentAllowed, blockTargetFeedCommentInput } = useProjectDetailReadonly({
    projectId: project.id,
    isProjectArchived,
    projectVisibility: projectVisibilityForReadonly
  })
  const {
    hasMappedProjectPermission,
    ensureMappedProjectPermission,
    canConfigureOverviewReminders,
    canEditProjectStatusFields,
    canEditProjectBasicFields,
    canEditTargetStatusFields,
    canEditTaskStatusFields,
    canEditTaskInfoFields,
    canCreateTaskOrSubtask,
    canManageTaskEditorAttachments,
    canDeleteTarget,
    canCreateTarget,
    canLinkTargetTasks,
    canManageTargetTabAttachments,
    canEditTargetDetailFields,
    canDeleteTask,
    canManageProjectMembers,
    canManageProjectRoles,
    canArchiveProject,
    canDeleteProject
  } = useProjectDetailPermissions({
    projectReadonly,
    projectReadonlyByPermission,
    backendFlatPerms,
    ensureProjectEditable
  })

  const {
    projectOverview,
    setProjectOverview,
    projectOverviewReminders,
    setProjectOverviewReminders,
    projectAttachments,
    setProjectAttachments,
    projectOverviewActivityRecords,
    overviewActivityVisibleCount,
    setOverviewActivityVisibleCount,
    visibleProjectOverviewActivityRecords,
    hasMoreProjectOverviewActivity,
    isOverviewHydrated,
    editingOverviewField,
    setEditingOverviewField,
    overviewTitleDraft,
    setOverviewTitleDraft,
    finishOverviewTitleEdit,
    overviewDescriptionDraft,
    setOverviewDescriptionDraft,
    isEditingStatusDescription,
    overviewStatusDescriptionDraft,
    setOverviewStatusDescriptionDraft,
    onBeginEditStatusDescription,
    finishOverviewStatusDescriptionEdit,
    commitOverviewStatusField,
    commitOverviewOwner,
    overviewReminderSettingsOpen,
    setOverviewReminderSettingsOpen,
    overviewReminderEditorOpen,
    setOverviewReminderEditorOpen,
    overviewReminderEditingId,
    setOverviewReminderEditingId,
    overviewReminderForm,
    overviewReminderAnchorDatesReady,
    overviewActivityActorName,
    appendOverviewActivityEntries,
    finishOverviewDescriptionEdit,
    flushWorkspaceNow,
    scheduleWorkspaceFlush,
    hasPendingWorkspaceSave,
    reloadWorkspaceFromServer,
    syncTaskParticipantsPatchToBackend,
    workspaceFeedPersistence,
    targetRelatedTasksByKey,
    setTargetRelatedTasksByKey,
    targetAttachmentsByKey,
    setTargetAttachmentsByKey,
    taskAttachmentsByKey,
    setTaskAttachmentsByKey,
    taskParticipantsByKey,
    setTaskParticipantsByKey
  } = useProjectDetailWorkspace({
    project,
    authedUserId,
    members,
    onUpdateProject,
    onServerRevision: updatedAt => {
      serverUpdatedAtRef.current = updatedAt
      bumpCollaborativeLocalMutation()
      acknowledgeCollaborativeRemoteRevision()
    },
    onLocalMutation: bumpCollaborativeLocalMutation,
    ensureProjectEditable,
    hasMappedProjectPermission
  })

  const isCollaborativeDirty = useCallback(() => {
    return Boolean(
      hasPendingWorkspaceSave() ||
      editingOverviewField ||
      editingTarget ||
      editingTask ||
      editingChildTask ||
      tableEditingCell ||
      createTargetModalOpen ||
      createTaskModalOpen
    )
  }, [
    hasPendingWorkspaceSave,
    editingOverviewField,
    editingTarget,
    editingTask,
    editingChildTask,
    tableEditingCell,
    createTargetModalOpen,
    createTaskModalOpen
  ])

  const handleCollaborativeRemoteChange = useCallback(async () => {
    await Promise.all([reloadWorkspaceFromServer(), reloadProjectTasksFromServer(), useBackendDataStore.getState().refreshProject(project.id)])
    const detail = await fetchProjectDetail(project.id)
    if (detail.ok) {
      serverUpdatedAtRef.current = detail.data.updatedAt
      acknowledgeCollaborativeRemoteRevision()
      onUpdateProject?.({
        ...project,
        title: detail.data.title,
        backendVisibility: detail.data.visibility === 'public' ? 'public' : 'private',
        backendArchived: detail.data.archived,
        backendProgressStatus: detail.data.progressStatus,
        createdAt: detail.data.createdAt,
        updatedAt: detail.data.updatedAt,
        cover: detail.data.coverKind === 'image' ? 'image' : 'gradient',
        image: detail.data.coverImageData ?? undefined
      })
    }
  }, [project, onUpdateProject, reloadWorkspaceFromServer, reloadProjectTasksFromServer])

  useCollaborativeProjectSync({
    projectId: project.id,
    enabled: isBackendAuthEnabled() && isOverviewHydrated && isTargetHydrated && isTaskManageHydrated,
    isDirty: isCollaborativeDirty,
    serverUpdatedAtRef,
    onRemoteChange: handleCollaborativeRemoteChange
  })

  const {
    projectRoles,
    setProjectRoles,
    defaultMemberRoleKey,
    addRoleOpen,
    setAddRoleOpen,
    addRoleForm,
    rolePermissionOpen,
    setRolePermissionOpen,
    activeRoleForPermission,
    setActiveRoleForPermission,
    rolePermissionsByKey,
    setRolePermissionsByKey,
    settingsSelectedRoleKeys,
    setSettingsSelectedRoleKeys,
    rolePermissionSaving,
    roleDeleting,
    roleDefaultSavingKey,
    addRoleSaving,
    persistProjectRolePermissions,
    createBackendProjectRole,
    setDefaultProjectRole,
    deleteSelectedCustomRoles,
    isCustomProjectRoleKey
  } = useProjectRoleManagement({
    projectId: project.id,
    backendRolesDetailed
  })

  const { addMemberModalEl, setAddMemberModalOpen, onOpenAddMemberModal, memberRoleModalOpen, setMemberRoleModalOpen, memberRoleTarget, setMemberRoleTarget, memberRoleDraft, setMemberRoleDraft, handleConfirmMemberRole, memberColumns, taskModalMembers } = useProjectMemberManagement({
    projectId: project.id,
    projectOverview,
    members,
    setMembers,
    backendMemberRows,
    ensureMappedProjectPermission,
    canManageProjectMembers,
    appendOverviewActivityEntries,
    defaultMemberRoleKey
  })

  useEffect(() => {
    if (canEditTargetDetailFields || !editingTargetField) return
    const gated: Array<typeof editingTargetField> = ['title', 'priority', 'metricUnit', 'metricStart', 'metricTarget', 'metricCurrent', 'description', 'acceptanceCriteria', 'deliveryNote', 'acceptanceFeedback']
    if (gated.includes(editingTargetField)) setEditingTargetField(null)
  }, [canEditTargetDetailFields, editingTargetField])

  const { projectSettingsMeta, settingsForm, settingsCoverUploadRef, isSettingsCoverHover, setIsSettingsCoverHover, projectWindowIso, saveProjectSettings, uploadSettingsCover } = useProjectSettingsMeta({
    project,
    projectOverview,
    setProjectOverview,
    isOverviewHydrated,
    projectServerAudit,
    setProjectServerAudit,
    members,
    targetList,
    taskManageList,
    isPersonalDeskProject,
    ensureProjectEditable,
    hasMappedProjectPermission,
    canCreatePublicProject,
    scheduleWorkspaceFlush,
    onUpdateProject,
    syncSettingsForm: activeTab === '更多设置' && settingsMenuKey === 'basic'
  })

  const overviewTab: UseProjectOverviewTabResult = useProjectOverviewTab({
    isPersonalDeskProject,
    projectOverview,
    setProjectOverview,
    setEditingOverviewField,
    setOverviewTitleDraft,
    setOverviewDescriptionDraft,
    projectSettingsMeta: { startDate: projectSettingsMeta.startDate, endDate: projectSettingsMeta.endDate },
    targetList,
    taskManageList,
    canConfigureOverviewReminders,
    overviewReminderForm,
    setOverviewReminderEditingId,
    setOverviewReminderEditorOpen,
    setProjectOverviewReminders,
    backendMemberRows,
    members,
    flushWorkspaceNow
  })

  const {
    membersWithEmailCount,
    overviewTaskStats,
    overviewActualGoalProgressPercent,
    overviewReminderTableColumns,
    onBeginEditOverviewTitle,
    onBeginEditOverviewDescription,
    onOverviewStartDatePick,
    onOverviewEndDatePick
  } = overviewTab

  const orgMembersForPickers = useOrgStore(s => s.members)
  const settingsOwnerOptions = useMemo(() => orgMembersForPickers.filter(m => !m.disabled).map(m => m.name), [orgMembersForPickers])

  const isSameStringList = (a: string[] | undefined, b: string[] | undefined) => {
    const aa = a ?? []
    const bb = b ?? []
    if (aa.length !== bb.length) return false
    for (let i = 0; i < aa.length; i += 1) {
      if (aa[i] !== bb[i]) return false
    }
    return true
  }

  const updateTaskParticipants = (taskKey: string, next: string[]) => {
    if (!ensureProjectEditable()) return
    setTaskParticipantsByKey(prev => {
      if (isSameStringList(prev[taskKey], next)) return prev
      const beforeStr = formatParticipantsForActivity(prev[taskKey])
      const afterStr = formatParticipantsForActivity(next)
      if (beforeStr !== afterStr) {
        appendTargetActivity(taskKey, {
          fieldLabel: '参与人',
          before: beforeStr,
          after: afterStr,
          targetTitle: (editingTask?.key === taskKey ? editingTask.title : undefined) ?? flattenTaskManageRows(taskManageList).find(t => t.key === taskKey)?.title
        })
      }
      queueMicrotask(() => {
        syncTaskParticipantsPatchToBackend({ [taskKey]: next })
      })
      return {
        ...prev,
        [taskKey]: next
      }
    })
  }

  const formatParticipantsForActivity = (list?: string[]) => (list?.length ? list.join('、') : '无')

  const feedStore = useTargetFeedStore({
    projectId: project.id,
    actor: overviewActivityActorName,
    resolveTargetTitle: (targetKey, overrideTitle) =>
      overrideTitle ?? (editingTask?.key === targetKey ? editingTask.title : undefined) ?? (editingTarget?.key === targetKey ? editingTarget.title : undefined) ?? targetList.find(t => t.key === targetKey)?.title ?? flattenTaskManageRows(taskManageList).find(t => t.key === targetKey)?.title ?? '',
    remotePersistence: workspaceFeedPersistence
  })

  const { activityByKey: targetActivityByKey, commentsByKey: targetCommentsByKey } = feedStore

  const appendTargetActivity = (targetKey: string, entry: Omit<TargetActivityRecord, 'id' | 'actor' | 'targetTitle' | 'createdAt'> & { targetTitle?: string }) => {
    feedStore.prependActivity(targetKey, entry)
  }

  const { reloadTasksFromBackend, updateTaskByKey, updateEditingTask, updateSubtaskByKey, handleCancelCreateTask, handleCreateTaskSubmit, createSubtaskForTask, renameSubtaskByKey, deleteSubtaskByKey, deleteTaskByKey } = useProjectTaskCrud({
    project,
    targetTypeLabel,
    taskTypeLabel,
    taskStageOptionTitles,
    taskManageList,
    setTaskManageList,
    setTargetList,
    members,
    taskModalMembers,
    projectWindowIso,
    entityDateValidationMode,
    projectOverview,
    ensureProjectEditable,
    hasMappedProjectPermission,
    overviewActivityActorName,
    editingTask,
    setEditingTask,
    editingChildTask,
    setEditingChildTask,
    setTaskEditorTab,
    setTargetSideTab,
    targetList,
    targetRelatedTasksByKey,
    setTaskParticipantsByKey,
    syncTaskParticipantsPatchToBackend,
    setTaskAttachmentsByKey,
    setTargetRelatedTasksByKey,
    prependActivityRecords: feedStore.prependActivityRecords,
    prependActivity: appendTargetActivity,
    createTaskForm,
    createTaskContinue,
    setCreateTaskModalOpen,
    setCreateTaskContinue,
    onLocalMutation: bumpCollaborativeLocalMutation
  })

  const { updateEditingTarget, commitTargetDescription, deleteTargetByKey, addTargetComment, handleCancelCreateTarget, handleCreateTargetSubmit } = useProjectTargetCrud({
    project,
    targetTypeLabel,
    isPersonalDeskProject,
    members,
    projectWindowIso,
    entityDateValidationMode,
    projectOverview,
    overviewActivityActorName,
    ensureProjectEditable,
    ensureMappedProjectPermission,
    ensureProjectMemberCommentAllowed,
    hasMappedProjectPermission,
    editingTarget,
    setEditingTarget,
    setEditingTargetField,
    targetDescriptionDraft,
    setTargetList,
    setTargetSideTab,
    setTargetCommentInput,
    targetCommentInput,
    setTargetRelatedTasksByKey,
    setTargetAttachmentsByKey,
    prependActivityRecords: feedStore.prependActivityRecords,
    addComment: feedStore.addComment,
    reloadTasksFromBackend,
    createTargetForm,
    createTargetContinue,
    setCreateTargetModalOpen,
    setCreateTargetContinue,
    detailFromExternal,
    onExternalDetailClose,
    onLocalMutation: bumpCollaborativeLocalMutation
  })

  const { recentTaskKeys, manageFlatTasks, getParentTaskBadge, openRelatedTaskDetailByKey, openTaskDetailByKey, openGanttTaskDetail } = useProjectDetailEditors({
    projectId: project.id,
    detailFromExternal,
    isTargetHydrated,
    isTaskManageHydrated,
    targetList,
    taskManageList,
    editingTarget,
    setEditingTarget,
    setEditingTargetField,
    editingTask,
    setEditingTask,
    editingChildTask,
    setEditingChildTask,
    setTaskEditorTab,
    setTargetSideTab,
    setTargetCommentInput
  })

  const { currentSideKey, activityFeedForSide, statusFlowForSide, setTargetSidePanelVisibleCount, visibleCommentsForSide, totalCommentsForSide, hasMoreCommentsForSide, visibleActivityFeedForSide, hasMoreActivityFeedForSide, visibleStatusFlowForSide, hasMoreStatusFlowForSide } = useTargetSidePanel({
    editingTask,
    editingTarget,
    targetActivityByKey,
    targetCommentsByKey,
    targetSideTab
  })

  const {
    targetFilter,
    setTargetFilter,
    targetSearchDraft,
    setTargetSearchDraft,
    onTargetSearchSubmit,
    onTargetSearchClear,
    targetFilterPopoverOpen,
    handleTargetFilterPopoverOpenChange,
    targetTableFilterDraft,
    setTargetTableFilterDraft,
    commitTargetTableFilterDraft,
    resetTargetTableFilters,
    targetTableFilterAppliedActive,
    renderTargetFilterValueControl,
    targetSortKey,
    setTargetSortKey,
    targetGroupMode,
    setTargetGroupMode,
    targetGroupShowEmpty,
    setTargetGroupShowEmpty,
    targetGrouped,
    filteredTargets,
    targetDisplayRows,
    expandedTargetGroupKeys,
    setExpandedTargetGroupKeys
  } = useTargetTablePipeline({ targetList, targetTypeLabel, targetActivityByKey, members })

  const {
    taskFilter,
    setTaskFilter,
    taskSearchDraft,
    setTaskSearchDraft,
    onTaskSearchSubmit,
    onTaskSearchClear,
    taskSortKey,
    setTaskSortKey,
    taskGroupMode,
    setTaskGroupMode,
    taskGroupShowEmpty,
    setTaskGroupShowEmpty,
    taskFilterPopoverOpen,
    handleTaskFilterPopoverOpenChange,
    taskTableFilterDraft,
    setTaskTableFilterDraft,
    commitTaskTableFilterDraft,
    resetTaskTableFilters,
    taskTableFilterAppliedActive,
    renderTaskManageFilterValueControl,
    taskRows,
    taskCount,
    expandedTaskKeys,
    setExpandedTaskKeys
  } = useTaskTablePipeline({
    taskManageList,
    taskTypeLabel,
    taskStageOptionTitles,
    targetActivityByKey,
    members,
    authedUserId,
    localMyTaskOwnerLabel
  })

  const {
    relatedPickerOpen,
    setRelatedPickerOpen,
    relatedPickerSearch,
    setRelatedPickerSearch,
    relatedPickerPendingKeys,
    setRelatedPickerPendingKeys,
    toggleRelatedPickerPending,
    confirmRelatedPicker,
    cancelRelatedPicker,
    removeRelatedTaskLink,
    relatedLinksForTarget,
    displayedRelatedLinks,
    relatedTasksOverallPercent,
    pickerRecentTasks,
    pickerRestTasks
  } = useTargetRelatedTasks({
    editingTarget,
    targetRelatedTasksByKey,
    setTargetRelatedTasksByKey,
    manageFlatTasks,
    recentTaskKeys,
    hideCompletedRelated,
    ensureMappedProjectPermission,
    prependTargetActivity: appendTargetActivity
  })

  const {
    addTargetAttachmentFromFile,
    removeTargetAttachmentItem,
    triggerDownloadTargetAttachment,
    triggerDownloadAllTargetAttachments,
    addTaskAttachmentFromFile,
    removeTaskAttachmentItem,
    triggerDownloadTaskAttachment,
    triggerDownloadAllTaskAttachments,
    addProjectAttachmentFromFile,
    removeProjectAttachmentItem,
    triggerDownloadProjectAttachment
  } = useWorkspaceAttachments({
    projectId: project.id,
    projectOverview,
    overviewActivityActorName,
    ensureMappedProjectPermission,
    editingTarget,
    taskManageList,
    targetAttachmentsByKey,
    setTargetAttachmentsByKey,
    taskAttachmentsByKey,
    setTaskAttachmentsByKey,
    projectAttachments,
    setProjectAttachments,
    prependTargetActivity: appendTargetActivity,
    appendOverviewActivityEntries
  })

  const { ganttRows, ganttRange, ganttDays } = useProjectGanttData({ taskManageList, ganttExpandLevel })

  useEffect(() => {
    if (editingTargetField !== 'description') return
    setTargetDescriptionDraft(editingTarget?.description ?? '')
  }, [editingTargetField, editingTarget?.key])

  const taskEditorSubtasks = useMemo(() => buildTaskEditorSubtasks(editingTask, manageFlatTasks), [editingTask, manageFlatTasks])

  const taskAttachmentsForEditingTask = useMemo(() => (editingTask?.key ? (taskAttachmentsByKey[editingTask.key] ?? []) : []), [editingTask?.key, taskAttachmentsByKey])

  const taskAttachmentsForEditingChildTask = useMemo(() => (editingChildTask?.key ? (taskAttachmentsByKey[editingChildTask.key] ?? []) : []), [editingChildTask?.key, taskAttachmentsByKey])

  const targetAttachmentsForEditor = useMemo(() => (editingTarget?.key ? (targetAttachmentsByKey[editingTarget.key] ?? []) : []), [editingTarget?.key, targetAttachmentsByKey])

  const targetTableColumns = useMemo(() => buildTargetTableColumns(targetColWidths, (key, w) => setTargetColWidths(prev => ({ ...prev, [key]: w }))), [targetColWidths])

  /** 与各列 width 之和一致，避免 scroll.x 过大导致右侧大片空白仍出现横向滚动条 */
  const targetTableScrollX = useMemo(() => Object.values(targetColWidths).reduce((s, w) => s + w, 0) + (targetGrouped ? TARGET_TABLE_EXPAND_COLUMN_SCROLL_PX : 0), [targetColWidths, targetGrouped])

  const taskTableScrollX = useMemo(() => Object.values(taskColWidths).reduce((s, w) => s + w, 0) + TASK_MANAGE_EXPAND_COLUMN_SCROLL_PX, [taskColWidths])

  const taskManageColumns = useMemo(
    () =>
      buildTaskManageColumns({
        members,
        taskAttachmentsByKey,
        tableEditingCell,
        setTableEditingCell,
        updateTaskByKey,
        readonly: projectReadonly,
        statusFieldReadonly: !canEditTaskStatusFields,
        taskInfoFieldReadonly: !canEditTaskInfoFields,
        taskStageOptionTitles,
        columnWidths: taskColWidths,
        onResizeColumn: (key, w) => setTaskColWidths(prev => ({ ...prev, [key]: w }))
      }),
    [canEditTaskInfoFields, canEditTaskStatusFields, members, projectReadonly, tableEditingCell, taskAttachmentsByKey, taskColWidths, taskStageOptionTitles, updateTaskByKey]
  )

  const { targetEditorModalEl, taskManageEditorModalEl } = useProjectDetailModals({
    editingTarget,
    setEditingTarget,
    editingTargetField,
    setEditingTargetField,
    targetTypeLabel,
    projectOverview,
    detailFromExternal,
    onExternalDetailClose,
    canDeleteTarget,
    deleteTargetByKey,
    projectReadonly,
    canEditTargetDetailFields,
    canEditTargetStatusFields,
    updateEditingTarget,
    members,
    editorTab,
    setEditorTab,
    relatedLinksForTarget,
    targetAttachmentsForEditor,
    targetDescriptionDraft,
    setTargetDescriptionDraft,
    commitTargetDescription,
    hideCompletedRelated,
    setHideCompletedRelated,
    relatedTasksOverallPercent,
    canLinkTargetTasks,
    setRelatedPickerOpen,
    setRelatedPickerPendingKeys,
    setRelatedPickerSearch,
    displayedRelatedLinks,
    manageFlatTasks,
    openRelatedTaskDetailByKey,
    removeRelatedTaskLink,
    relatedPickerOpen,
    relatedPickerSearch,
    pickerRecentTasks,
    pickerRestTasks,
    relatedPickerPendingKeys,
    toggleRelatedPickerPending,
    cancelRelatedPicker,
    confirmRelatedPicker,
    canManageTargetTabAttachments,
    triggerDownloadAllTargetAttachments,
    addTargetAttachmentFromFile,
    triggerDownloadTargetAttachment,
    removeTargetAttachmentItem,
    targetSideTab,
    setTargetSideTab,
    totalCommentsForSide,
    visibleCommentsForSide,
    hasMoreCommentsForSide,
    setTargetSidePanelVisibleCount,
    activityFeedForSide,
    visibleActivityFeedForSide,
    hasMoreActivityFeedForSide,
    statusFlowForSide,
    visibleStatusFlowForSide,
    hasMoreStatusFlowForSide,
    targetCommentInput,
    setTargetCommentInput,
    blockTargetFeedCommentInput,
    currentSideKey,
    addTargetComment,
    editingTask,
    setEditingTask,
    editingChildTask,
    setEditingChildTask,
    getParentTaskBadge,
    flushWorkspaceNow,
    canEditTaskStatusFields,
    canEditTaskInfoFields,
    canCreateTaskOrSubtask,
    canManageTaskEditorAttachments,
    canDeleteTask,
    deleteTaskByKey,
    updateEditingTask,
    updateTaskByKey,
    taskStageOptionTitles,
    openTaskDetailByKey,
    createSubtaskForTask,
    renameSubtaskByKey,
    deleteSubtaskByKey,
    updateSubtaskByKey,
    taskEditorTab,
    setTaskEditorTab,
    taskAttachmentsForEditingTask,
    taskAttachmentsForEditingChildTask,
    addTaskAttachmentFromFile,
    removeTaskAttachmentItem,
    triggerDownloadTaskAttachment,
    triggerDownloadAllTaskAttachments,
    taskEditorSubtasks,
    targetCommentsByKey,
    targetActivityByKey,
    taskModalMembers,
    taskParticipantsByKey,
    updateTaskParticipants,
    isPersonalDeskProject
  })

  const readonlyTipEl = <ProjectReadonlyBanner isProjectArchived={isProjectArchived} isPublicProjectReadonlyBySystem={isPublicProjectReadonlyBySystem} isProjectReadonlyByRole={isProjectReadonlyByRole} />

  if (activeTab === '更多设置') {
    return (
      <ProjectSettingsTab
        readonlyTipEl={readonlyTipEl}
        readonlyBlockStyle={readonlyBlockStyle}
        isProjectArchived={isProjectArchived}
        isProjectReadonlyByRole={isProjectReadonlyByRole || isPublicProjectReadonlyBySystem}
        settingsMenuKey={settingsMenuKey}
        setSettingsMenuKey={setSettingsMenuKey}
        members={members as any}
        setMembers={setMembers as any}
        settingsSelectedMemberKeys={settingsSelectedMemberKeys}
        setSettingsSelectedMemberKeys={setSettingsSelectedMemberKeys}
        setAddMemberModalOpen={setAddMemberModalOpen}
        projectRoles={projectRoles}
        setProjectRoles={setProjectRoles}
        setActiveRoleForPermission={setActiveRoleForPermission}
        setRolePermissionOpen={setRolePermissionOpen}
        rolePermissionOpen={rolePermissionOpen}
        activeRoleForPermission={activeRoleForPermission}
        rolePermissionsByKey={rolePermissionsByKey}
        setRolePermissionsByKey={setRolePermissionsByKey}
        rolePermissionSections={PROJECT_PERMISSION_SECTIONS}
        canManageProjectMembers={canManageProjectMembers}
        canManageProjectRoles={canManageProjectRoles}
        canArchiveProject={canArchiveProject}
        canDeleteProject={canDeleteProject}
        addRoleOpen={addRoleOpen}
        setAddRoleOpen={setAddRoleOpen}
        addRoleForm={addRoleForm}
        settingsForm={settingsForm}
        isSettingsCoverHover={isSettingsCoverHover}
        setIsSettingsCoverHover={setIsSettingsCoverHover}
        settingsCoverUploadRef={settingsCoverUploadRef}
        uploadSettingsCover={uploadSettingsCover}
        settingsOwnerOptions={settingsOwnerOptions}
        templateName={templateConfig.name}
        saveProjectSettings={saveProjectSettings}
        project={project}
        setIsProjectArchived={setIsProjectArchived}
        onDeleteProject={onDeleteProject}
        onUpdateProject={onUpdateProject}
        addMemberModalEl={addMemberModalEl}
        settingsSelectedRoleKeys={settingsSelectedRoleKeys}
        setSettingsSelectedRoleKeys={setSettingsSelectedRoleKeys}
        rolePermissionSaving={rolePermissionSaving}
        roleDeleting={roleDeleting}
        roleDefaultSavingKey={roleDefaultSavingKey}
        addRoleSaving={addRoleSaving}
        persistProjectRolePermissions={persistProjectRolePermissions}
        createBackendProjectRole={createBackendProjectRole}
        setDefaultProjectRole={setDefaultProjectRole}
        deleteSelectedCustomRoles={deleteSelectedCustomRoles}
        isCustomProjectRoleKey={isCustomProjectRoleKey}
      />
    )
  }

  if (activeTab === '甘特图') {
    return (
      <ProjectGanttTab
        readonlyBlockStyle={readonlyBlockStyle}
        ganttDays={ganttDays}
        ganttRows={ganttRows}
        ganttRange={ganttRange}
        taskManageEditorModalEl={taskManageEditorModalEl}
        ganttExpandLevel={ganttExpandLevel}
        onGanttExpandLevelChange={setGanttExpandLevel}
        ganttDisplayMode={ganttDisplayMode}
        onGanttDisplayModeChange={setGanttDisplayMode}
        taskStageOptionTitles={taskStageOptionTitles}
        onOpenTaskDetail={openGanttTaskDetail}
        members={members}
        columnResizeStorageKey={project.id}
        contentLoading={!isTaskManageHydrated}
      />
    )
  }

  if (activeTab === '任务管理') {
    return (
      <ProjectTasksTab
        tableLoading={!isTaskManageHydrated}
        readonlyBlockStyle={readonlyBlockStyle}
        isProjectArchived={isProjectArchived}
        canCreateTask={canCreateTaskOrSubtask}
        taskFilter={taskFilter}
        setTaskFilter={setTaskFilter}
        taskTypeLabel={taskTypeLabel}
        taskManageList={taskManageList}
        taskCount={taskCount}
        taskRows={taskRows}
        taskManageColumns={taskManageColumns}
        expandedTaskKeys={expandedTaskKeys}
        setExpandedTaskKeys={setExpandedTaskKeys}
        setEditingTask={setEditingTask}
        setEditingChildTask={setEditingChildTask}
        setTaskEditorTab={setTaskEditorTab}
        createTaskModalOpen={createTaskModalOpen}
        setCreateTaskModalOpen={setCreateTaskModalOpen}
        createTaskContinue={createTaskContinue}
        setCreateTaskContinue={setCreateTaskContinue}
        createTaskForm={createTaskForm}
        handleCancelCreateTask={handleCancelCreateTask}
        handleCreateTaskSubmit={handleCreateTaskSubmit}
        members={members}
        taskStageOptions={taskStageOptionTitles}
        taskManageEditorModalEl={taskManageEditorModalEl}
        taskSearchDraft={taskSearchDraft}
        onTaskSearchDraftChange={setTaskSearchDraft}
        onTaskSearchSubmit={onTaskSearchSubmit}
        onTaskSearchClear={onTaskSearchClear}
        taskSortKey={taskSortKey}
        onTaskSortKeyChange={setTaskSortKey}
        taskGroupMode={taskGroupMode}
        onTaskGroupModeChange={setTaskGroupMode}
        taskGroupShowEmpty={taskGroupShowEmpty}
        onTaskGroupShowEmptyChange={setTaskGroupShowEmpty}
        tableScrollX={taskTableScrollX}
        taskFilterPopoverOpen={taskFilterPopoverOpen}
        onTaskFilterPopoverOpenChange={handleTaskFilterPopoverOpenChange}
        taskTableFilterDraft={taskTableFilterDraft}
        setTaskTableFilterDraft={setTaskTableFilterDraft}
        onCommitTaskTableFilterDraft={commitTaskTableFilterDraft}
        onResetTaskTableFilters={resetTaskTableFilters}
        taskTableFilterAppliedActive={taskTableFilterAppliedActive}
        renderTaskTableFilterValue={renderTaskManageFilterValueControl}
      />
    )
  }

  if (activeTab === '目标管理') {
    return (
      <ProjectTargetsTab
        tableLoading={!isTargetHydrated}
        readonlyBlockStyle={readonlyBlockStyle}
        targetFilter={targetFilter}
        setTargetFilter={setTargetFilter}
        canCreateTarget={canCreateTarget}
        targetTypeLabel={targetTypeLabel}
        createTargetModalOpen={createTargetModalOpen}
        setCreateTargetModalOpen={setCreateTargetModalOpen}
        createTargetContinue={createTargetContinue}
        setCreateTargetContinue={setCreateTargetContinue}
        createTargetForm={createTargetForm}
        handleCancelCreateTarget={handleCancelCreateTarget}
        handleCreateTargetSubmit={handleCreateTargetSubmit}
        targetSearchDraft={targetSearchDraft}
        setTargetSearchDraft={setTargetSearchDraft}
        onTargetSearchSubmit={onTargetSearchSubmit}
        onTargetSearchClear={onTargetSearchClear}
        targetFilterPopoverOpen={targetFilterPopoverOpen}
        onTargetFilterPopoverOpenChange={handleTargetFilterPopoverOpenChange}
        targetTableFilterDraft={targetTableFilterDraft}
        setTargetTableFilterDraft={setTargetTableFilterDraft}
        onCommitTargetTableFilterDraft={commitTargetTableFilterDraft}
        onResetTargetTableFilters={resetTargetTableFilters}
        targetTableFilterAppliedActive={targetTableFilterAppliedActive}
        renderTargetFilterValueControl={renderTargetFilterValueControl}
        targetSortKey={targetSortKey}
        setTargetSortKey={setTargetSortKey}
        targetGroupMode={targetGroupMode}
        setTargetGroupMode={setTargetGroupMode}
        targetGroupShowEmpty={targetGroupShowEmpty}
        setTargetGroupShowEmpty={setTargetGroupShowEmpty}
        targetGrouped={targetGrouped}
        filteredTargetsCount={filteredTargets.length}
        targetTableColumns={targetTableColumns}
        targetDisplayRows={targetDisplayRows}
        targetTableScrollX={targetTableScrollX}
        expandedTargetGroupKeys={expandedTargetGroupKeys}
        setExpandedTargetGroupKeys={setExpandedTargetGroupKeys}
        onOpenTargetRow={record => {
          setEditingTarget(record)
          setEditorTab('任务信息')
          setEditingTargetField(null)
          setTargetSideTab('评论')
          setTargetCommentInput('')
        }}
        targetEditorModalEl={targetEditorModalEl}
        taskManageEditorModalEl={taskManageEditorModalEl}
      />
    )
  }

  if (!isOverviewHydrated) {
    return (
      <ProjectOverviewTab>
        <ProjectOverviewTabSkeleton />
      </ProjectOverviewTab>
    )
  }

  return (
    <ProjectOverviewTab>
      <ProjectOverviewTabView
        readonlyBlockStyle={readonlyBlockStyle}
        project={project}
        projectReadonly={projectReadonly}
        canConfigureOverviewReminders={canConfigureOverviewReminders}
        canEditProjectBasicFields={canEditProjectBasicFields}
        canEditProjectStatusFields={canEditProjectStatusFields}
        canManageProjectMembers={canManageProjectMembers}
        projectOverview={projectOverview}
        editingOverviewField={editingOverviewField}
        setEditingOverviewField={setEditingOverviewField}
        overviewTitleDraft={overviewTitleDraft}
        setOverviewTitleDraft={setOverviewTitleDraft}
        onBeginEditOverviewTitle={onBeginEditOverviewTitle}
        finishOverviewTitleEdit={finishOverviewTitleEdit}
        overviewDescriptionDraft={overviewDescriptionDraft}
        setOverviewDescriptionDraft={setOverviewDescriptionDraft}
        finishOverviewDescriptionEdit={finishOverviewDescriptionEdit}
        onBeginEditOverviewDescription={onBeginEditOverviewDescription}
        onOverviewStartDatePick={onOverviewStartDatePick}
        onOverviewEndDatePick={onOverviewEndDatePick}
        members={members}
        memberColumns={memberColumns}
        addMemberModalEl={addMemberModalEl}
        memberRoleModalOpen={memberRoleModalOpen}
        setMemberRoleModalOpen={setMemberRoleModalOpen}
        memberRoleTarget={memberRoleTarget}
        setMemberRoleTarget={setMemberRoleTarget}
        memberRoleDraft={memberRoleDraft}
        setMemberRoleDraft={setMemberRoleDraft}
        handleConfirmMemberRole={handleConfirmMemberRole}
        onOpenAddMemberModal={onOpenAddMemberModal}
        projectAttachments={projectAttachments}
        addProjectAttachmentFromFile={addProjectAttachmentFromFile}
        triggerDownloadProjectAttachment={triggerDownloadProjectAttachment}
        removeProjectAttachmentItem={removeProjectAttachmentItem}
        projectOverviewActivityRecords={projectOverviewActivityRecords}
        visibleProjectOverviewActivityRecords={visibleProjectOverviewActivityRecords}
        hasMoreProjectOverviewActivity={hasMoreProjectOverviewActivity}
        overviewActivityVisibleCount={overviewActivityVisibleCount}
        setOverviewActivityVisibleCount={setOverviewActivityVisibleCount}
        isEditingStatusDescription={isEditingStatusDescription}
        overviewStatusDescriptionDraft={overviewStatusDescriptionDraft}
        setOverviewStatusDescriptionDraft={setOverviewStatusDescriptionDraft}
        onBeginEditStatusDescription={onBeginEditStatusDescription}
        finishOverviewStatusDescriptionEdit={finishOverviewStatusDescriptionEdit}
        commitOverviewStatusField={commitOverviewStatusField}
        commitOverviewOwner={commitOverviewOwner}
        overviewTaskStats={overviewTaskStats}
        overviewActualGoalProgressPercent={overviewActualGoalProgressPercent}
        projectServerAudit={projectServerAudit}
        overviewReminderSettingsOpen={overviewReminderSettingsOpen}
        setOverviewReminderSettingsOpen={setOverviewReminderSettingsOpen}
        overviewReminderEditorOpen={overviewReminderEditorOpen}
        setOverviewReminderEditorOpen={setOverviewReminderEditorOpen}
        overviewReminderEditingId={overviewReminderEditingId}
        setOverviewReminderEditingId={setOverviewReminderEditingId}
        overviewReminderForm={overviewReminderForm}
        overviewReminderAnchorDatesReady={overviewReminderAnchorDatesReady}
        projectOverviewReminders={projectOverviewReminders}
        setProjectOverviewReminders={setProjectOverviewReminders}
        overviewReminderTableColumns={overviewReminderTableColumns}
        membersWithEmailCount={membersWithEmailCount}
        flushWorkspaceNow={flushWorkspaceNow}
        taskManageEditorModalEl={taskManageEditorModalEl}
      />
    </ProjectOverviewTab>
  )
}
