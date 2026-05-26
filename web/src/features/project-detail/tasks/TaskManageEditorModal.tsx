import { CalendarOutlined, CloseOutlined, DeleteOutlined, DownloadOutlined, EyeInvisibleOutlined, EyeOutlined, EditOutlined, EllipsisOutlined, FileOutlined, FileTextOutlined, FileWordOutlined, FolderFilled, HomeOutlined, UserOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Avatar, Button, DatePicker, Dropdown, Empty, Input, message, Modal, Select, Space, Tag, Typography, Upload } from 'antd'
import dayjs from 'dayjs'
import { DEFAULT_TASK_STAGE_TITLES, getProjectTemplateConfig } from '../../../entities/project/config/projectTemplates'
import { decodeTargetPayload, encodeTargetPayload, formatActivityFieldDisplay, isoDateToMonthDay } from './projectTaskAdapter'
import { ActivityParticipantActivityBody, filterActivityFeedItems } from '../shared/activityParticipantActivity'
import { TargetFeedCommentComposer } from '../TargetFeedCommentComposer'
import { PriorityWithMarks, TASK_PRIORITY_LEVELS, type TaskPriorityLevel } from '../../../shared/ui/priorityWithMarks'
import { UNIFIED_OWNER_AVATAR_CLASS, UnifiedWorkflowStatusTag, unifiedOwnerAvatarInitials, WorkflowStatusEditorRing } from '../../../shared/ui/unifiedWorkflowStatusTag'
import type { TargetCommentRecord } from '../../../entities/target-feed/model/useTargetFeedStore'
import type { WorkspaceActivityRecord, WorkspaceAttachmentItem } from '../hooks/useProjectDetailWorkspace'
import type { ProjectOverviewInfo } from '../overview/overviewTypes'
import { formatAuditZh } from '../targets/targetMeta'
import type { TargetSideTab } from '../targets/targetTypes'
import type { CreateSubtaskOptions, TaskEditorSubtask, TaskEditorTab, TaskManageRecord } from './taskTypes'

export type { CreateSubtaskOptions, TaskEditorSubtask } from './taskTypes'

type MemberRecord = {
  key: string
  name: string
  role: string
  dept: string
  action: string
}

/** 任务详情侧栏「评论 / 活动 / 流转」列表默认展示条数 */
const TARGET_SIDE_PANEL_PAGE_SIZE = 10

type TaskTemplateType = '项目任务' | '评审任务' | '发布任务'

type TaskTemplateField = {
  key: string
  label: string
  placeholder: string
  required?: boolean
}

const TASK_TEMPLATE_OPTIONS: { value: TaskTemplateType; label: string }[] = [
  { value: '项目任务', label: '项目任务' },
  { value: '评审任务', label: '评审任务' },
  { value: '发布任务', label: '发布任务' }
]

const TASK_TEMPLATE_FIELDS: Record<TaskTemplateType, TaskTemplateField[]> = {
  项目任务: [],
  评审任务: [
    { key: 'reviewer', label: '评审人', placeholder: '请输入评审人', required: true },
    { key: 'reviewRound', label: '评审轮次', placeholder: '请输入轮次（如 R1）' }
  ],
  发布任务: [
    { key: 'releaseEnv', label: '发布环境', placeholder: '请输入发布环境', required: true },
    { key: 'changeTicket', label: '变更单号', placeholder: '请输入变更单号' }
  ]
}

/** 个人工作台新建子任务：与「我的任务」父级类型一致，不走评审/发布模板 */
export type PersonalDeskSubtaskKind = 'deskGoal' | 'deskProjectTask' | 'deskGenericTask'

export type SubtaskCreateTaskType = TaskTemplateType | PersonalDeskSubtaskKind

type TargetActivityRecord = WorkspaceActivityRecord

function isPersonalDeskSubtaskKind(t: SubtaskCreateTaskType): t is PersonalDeskSubtaskKind {
  return t === 'deskGoal' || t === 'deskProjectTask' || t === 'deskGenericTask'
}

function personalDeskSubtaskTypeSelectOptions() {
  const pm = getProjectTemplateConfig('project-management')
  return [
    { value: 'deskGoal' as const, label: pm.targetTypeLabel },
    { value: 'deskProjectTask' as const, label: pm.taskTypeLabel },
    { value: 'deskGenericTask' as const, label: '任务' }
  ]
}

function buildPersonalDeskSubtaskDescription(kind: PersonalDeskSubtaskKind, freeDescription: string): string {
  const tmpl = getProjectTemplateConfig('project-management')
  const now = dayjs()
  if (kind === 'deskGoal') {
    return encodeTargetPayload({
      type: tmpl.targetTypeLabel,
      meta: `优先级: 普通    更新时间 ${now.format('M月D日 HH:mm')}`,
      textDescription: freeDescription.trim()
    })
  }
  if (kind === 'deskGenericTask') return '任务'
  const t = freeDescription.trim()
  return t || '无'
}

const formatDateTime = (iso: string) => dayjs(iso).format('M月D日 HH:mm')

const parseTaskDateValue = (s: string | undefined) => {
  if (!s) return null
  const m = dayjs(s.trim(), ['YYYY-MM-DD', 'YYYY年M月D日', 'M月D日'], true)
  return m.isValid() ? m : null
}

const formatTaskDateDisplay = (s: string | undefined) => {
  if (!s?.trim()) return ''
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return isoDateToMonthDay(t)
  return s
}

const formatTaskAttachmentSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function TaskAttachmentFileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'doc' || ext === 'docx') {
    return (
      <span className="wt-target-attachment-file-icon wt-target-attachment-file-icon--word">
        <FileWordOutlined />
      </span>
    )
  }
  if (ext === 'txt') {
    return <span className="wt-target-attachment-file-icon wt-target-attachment-file-icon--txt">TXT</span>
  }
  return (
    <span className="wt-target-attachment-file-icon wt-target-attachment-file-icon--generic">
      <FileOutlined />
    </span>
  )
}

export type TaskManageEditorModalProps = {
  task: TaskManageRecord | null
  parentTaskBadge?: string
  onClose: () => void
  readonly: boolean
  canEditStatusFields: boolean
  /** 任务信息：标题、阶段、优先级、描述、参与人等（任务管理::编辑任务） */
  canEditTaskInfoFields: boolean
  /** 新建子任务（任务管理::新建任务） */
  canCreateSubtask: boolean
  /** 任务附件上传/删除（任务管理::管理附件） */
  canManageTaskAttachments: boolean
  canDeleteTask: boolean
  deleteTask: (taskKey: string) => Promise<boolean>
  projectOverview: ProjectOverviewInfo
  updateTask: (patch: Partial<TaskManageRecord>) => void
  taskStageOptions: string[]
  openTaskDetail: (taskKey: string) => void
  createSubtask: (parentTaskKey: string, title: string, options?: CreateSubtaskOptions) => void
  renameSubtask: (taskKey: string, title: string) => void
  deleteSubtask: (taskKey: string) => Promise<boolean>
  updateSubtask: (taskKey: string, patch: Partial<TaskManageRecord>) => void
  taskEditorTab: TaskEditorTab
  setTaskEditorTab: Dispatch<SetStateAction<TaskEditorTab>>
  taskAttachments: WorkspaceAttachmentItem[]
  addTaskAttachmentFromFile: (taskKey: string, file: File) => void
  removeTaskAttachmentItem: (taskKey: string, attachmentId: string) => void
  triggerDownloadTaskAttachment: (item: WorkspaceAttachmentItem) => void
  triggerDownloadAllTaskAttachments: (items: WorkspaceAttachmentItem[]) => void
  taskEditorSubtasks: TaskEditorSubtask[]
  targetSideTab: TargetSideTab
  setTargetSideTab: Dispatch<SetStateAction<TargetSideTab>>
  targetCommentsByKey: Record<string, TargetCommentRecord[]>
  targetActivityByKey: Record<string, TargetActivityRecord[]>
  targetCommentInput: string
  setTargetCommentInput: Dispatch<SetStateAction<string>>
  currentSideKey: string
  addTargetComment: (key: string) => void
  members: MemberRecord[]
  taskParticipants: string[]
  updateTaskParticipants: (taskKey: string, next: string[]) => void
  /** 归档或公开项目非成员时禁用评论框；只读成员仍可评论 */
  targetCommentInputDisabled?: boolean
  /** 个人工作台项目：子任务类型与「我的任务」父级一致，不含评审/发布 */
  isPersonalDeskProject?: boolean
}

export function TaskManageEditorModal({
  task,
  parentTaskBadge,
  onClose,
  readonly,
  canEditStatusFields,
  canEditTaskInfoFields,
  canCreateSubtask,
  canManageTaskAttachments,
  canDeleteTask,
  deleteTask,
  projectOverview,
  updateTask,
  taskStageOptions,
  openTaskDetail,
  createSubtask,
  renameSubtask,
  deleteSubtask,
  updateSubtask,
  taskEditorTab,
  setTaskEditorTab,
  taskAttachments,
  addTaskAttachmentFromFile,
  removeTaskAttachmentItem,
  triggerDownloadTaskAttachment,
  triggerDownloadAllTaskAttachments,
  taskEditorSubtasks,
  targetSideTab,
  setTargetSideTab,
  targetCommentsByKey,
  targetActivityByKey,
  targetCommentInput,
  setTargetCommentInput,
  currentSideKey,
  addTargetComment,
  members,
  taskParticipants,
  updateTaskParticipants,
  targetCommentInputDisabled = false,
  isPersonalDeskProject = false
}: TaskManageEditorModalProps) {
  const descTrim = task?.description?.trim()
  const payloadSource = descTrim && descTrim !== '无' ? descTrim : ''
  const decodedTargetPayload = payloadSource ? decodeTargetPayload(payloadSource) : null
  const taskBizLabel = task?.bizLabel ?? (descTrim === '任务' ? '任务' : descTrim === '部门会议' ? '部门会议' : undefined)
  /** 「任务」「部门会议」不展示项目阶段（无执行阶段等） */
  const hideProjectStageRow = taskBizLabel === '任务' || taskBizLabel === '部门会议'
  const taskHeaderName = decodedTargetPayload?.type ? decodedTargetPayload.type : taskBizLabel === '任务' ? '任务' : taskBizLabel === '部门会议' ? '部门会议' : '项目任务'
  const isSubtaskDetail = task?.kind === 'subtask'
  const blockTaskInfoFields = readonly || !canEditTaskInfoFields
  const blockCreateSubtask = readonly || !canCreateSubtask
  const blockTaskAttachments = readonly || !canManageTaskAttachments

  const [editingTaskField, setEditingTaskField] = useState<'title' | 'status' | 'owner' | 'start' | 'end' | 'stage' | 'priority' | 'description' | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState<string>('')
  const [creatingSubtask, setCreatingSubtask] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [createSubtaskModalOpen, setCreateSubtaskModalOpen] = useState(false)
  const [hideCompletedSubtasks, setHideCompletedSubtasks] = useState(true)
  const [hoveredSubtaskKey, setHoveredSubtaskKey] = useState<string | null>(null)
  const [targetSidePanelVisibleCount, setTargetSidePanelVisibleCount] = useState(TARGET_SIDE_PANEL_PAGE_SIZE)
  const [editingSubtaskKey, setEditingSubtaskKey] = useState<string | null>(null)
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('')
  const [editingSubtaskMeta, setEditingSubtaskMeta] = useState<{
    key: string
    field: 'end' | 'status' | 'owner'
  } | null>(null)
  const [createSubtaskDraft, setCreateSubtaskDraft] = useState<{
    title: string
    taskType: SubtaskCreateTaskType
    owner?: string
    start?: string
    end?: string
    priority: TaskManageRecord['priority']
    participants: string[]
    description: string
    templateFields: Record<string, string>
  }>({
    title: '',
    taskType: '项目任务',
    owner: undefined,
    start: '',
    end: '',
    priority: '普通',
    participants: [],
    description: '',
    templateFields: {}
  })

  useEffect(() => {
    setEditingTaskField(null)
    setTitleDraft(task?.title ?? '')
    setDescriptionDraft(task?.description ?? '')
    setCreatingSubtask(false)
    setNewSubtaskTitle('')
    setCreateSubtaskModalOpen(false)
    setHoveredSubtaskKey(null)
    setEditingSubtaskKey(null)
    setEditingSubtaskTitle('')
    setEditingSubtaskMeta(null)
    setHideCompletedSubtasks(true)
  }, [task?.key])

  useEffect(() => {
    if (editingTaskField !== 'description') return
    setDescriptionDraft(task?.description ?? '')
  }, [editingTaskField, task?.key])

  const commitTitle = () => {
    if (!task) return
    if (blockTaskInfoFields) {
      setEditingTaskField(null)
      return
    }
    const trimmed = titleDraft.trim()
    const nextTitle = trimmed || task.title
    if (nextTitle !== task.title) {
      updateTask({ title: nextTitle })
    }
    setEditingTaskField(null)
  }

  const commitDescription = () => {
    if (!task) return
    if (blockTaskInfoFields) {
      setEditingTaskField(null)
      return
    }
    const before = task.description ?? ''
    const next = descriptionDraft

    if (next !== before) {
      updateTask({ description: next })
    }
    setEditingTaskField(null)
  }

  const completedSubtaskCount = useMemo(() => taskEditorSubtasks.filter(sub => sub.status === '已完成').length, [taskEditorSubtasks])
  const subtaskProgressPercent = taskEditorSubtasks.length > 0 ? Math.round((completedSubtaskCount / taskEditorSubtasks.length) * 100) : 0
  const visibleTaskEditorSubtasks = useMemo(() => (hideCompletedSubtasks ? taskEditorSubtasks.filter(sub => sub.status !== '已完成') : taskEditorSubtasks), [hideCompletedSubtasks, taskEditorSubtasks])
  const createSubtaskTypeSelectOptions = useMemo(
    () =>
      (isPersonalDeskProject ? personalDeskSubtaskTypeSelectOptions() : TASK_TEMPLATE_OPTIONS) as {
        value: SubtaskCreateTaskType
        label: string
      }[],
    [isPersonalDeskProject]
  )
  const createSubtaskTemplateFields = useMemo(() => {
    if (isPersonalDeskProject && isPersonalDeskSubtaskKind(createSubtaskDraft.taskType)) {
      return [] as TaskTemplateField[]
    }
    return TASK_TEMPLATE_FIELDS[createSubtaskDraft.taskType as TaskTemplateType] ?? []
  }, [isPersonalDeskProject, createSubtaskDraft.taskType])
  const commitRenameSubtask = () => {
    if (!editingSubtaskKey) return
    const title = editingSubtaskTitle.trim()
    if (title) renameSubtask(editingSubtaskKey, title)
    setEditingSubtaskKey(null)
    setEditingSubtaskTitle('')
  }

  const openCreateSubtaskModal = () => {
    if (!canCreateSubtask || readonly) return
    const title = newSubtaskTitle.trim()
    if (!title || !task) return
    setCreateSubtaskDraft({
      title,
      taskType: isPersonalDeskProject ? 'deskProjectTask' : '项目任务',
      owner: task.owner,
      start: '',
      end: '',
      priority: '普通',
      participants: [],
      description: '',
      templateFields: {}
    })
    setCreateSubtaskModalOpen(true)
  }

  const submitCreateSubtask = () => {
    if (!task) return
    if (!canCreateSubtask || readonly) return
    const title = createSubtaskDraft.title.trim()
    if (!title) return
    const templateFields = createSubtaskTemplateFields
    const missingRequired = templateFields.find(field => field.required && !createSubtaskDraft.templateFields[field.key]?.trim())
    if (missingRequired) {
      message.warning(`请填写${missingRequired.label}`)
      return
    }
    const templateSummary = templateFields
      .map(field => {
        const value = createSubtaskDraft.templateFields[field.key]?.trim()
        return value ? `${field.label}: ${value}` : ''
      })
      .filter(Boolean)
      .join('\n')
    let descriptionWithTemplate: string
    if (isPersonalDeskProject && isPersonalDeskSubtaskKind(createSubtaskDraft.taskType)) {
      descriptionWithTemplate = buildPersonalDeskSubtaskDescription(createSubtaskDraft.taskType, createSubtaskDraft.description)
    } else {
      descriptionWithTemplate = [createSubtaskDraft.description.trim(), templateSummary].filter(Boolean).join('\n')
    }
    const parentStage = task.stage ?? taskStageOptions[0] ?? DEFAULT_TASK_STAGE_TITLES[0]
    createSubtask(task.key, title, {
      owner: createSubtaskDraft.owner,
      start: createSubtaskDraft.start || undefined,
      end: createSubtaskDraft.end || undefined,
      stage: parentStage,
      priority: createSubtaskDraft.priority,
      participants: createSubtaskDraft.participants,
      description: descriptionWithTemplate || undefined
    })
    setCreateSubtaskModalOpen(false)
    setCreatingSubtask(false)
    setNewSubtaskTitle('')
  }

  const activityFeedForSide = useMemo(() => filterActivityFeedItems(targetActivityByKey[currentSideKey] ?? []), [targetActivityByKey, currentSideKey])

  const statusFlowForSide = useMemo(() => activityFeedForSide.filter(item => item.fieldLabel === '状态'), [activityFeedForSide])

  useEffect(() => {
    setTargetSidePanelVisibleCount(TARGET_SIDE_PANEL_PAGE_SIZE)
  }, [currentSideKey, targetSideTab])

  const visibleCommentsForSide = useMemo(
    () => (targetCommentsByKey[currentSideKey] ?? []).slice(0, targetSidePanelVisibleCount),
    [currentSideKey, targetCommentsByKey, targetSidePanelVisibleCount]
  )
  const totalCommentsForSide = (targetCommentsByKey[currentSideKey] ?? []).length
  const hasMoreCommentsForSide = totalCommentsForSide > targetSidePanelVisibleCount

  const visibleActivityFeedForSide = useMemo(
    () => activityFeedForSide.slice(0, targetSidePanelVisibleCount),
    [activityFeedForSide, targetSidePanelVisibleCount]
  )
  const hasMoreActivityFeedForSide = activityFeedForSide.length > targetSidePanelVisibleCount

  const visibleStatusFlowForSide = useMemo(
    () => statusFlowForSide.slice(0, targetSidePanelVisibleCount),
    [statusFlowForSide, targetSidePanelVisibleCount]
  )
  const hasMoreStatusFlowForSide = statusFlowForSide.length > targetSidePanelVisibleCount

  const handleDeleteCurrent = () => {
    if (readonly) return
    if (!canDeleteTask) {
      message.warning('当前角色暂无「删除任务」权限')
      return
    }
    if (!task) return

    const isSubtask = task.kind === 'subtask'
    const title = isSubtask ? '删除子任务' : '删除任务'
    const content = `确认删除${isSubtask ? '子任务' : '任务'}「${task.title}」吗？`

    Modal.confirm({
      title,
      content,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const ok = isSubtask ? await deleteSubtask(task.key) : await deleteTask(task.key)
        if (!ok) return Promise.reject(new Error('delete aborted'))
        message.success(isSubtask ? '子任务删除成功' : '任务删除成功')
        onClose()
      }
    })
  }

  return (
    <Modal open={Boolean(task)} onCancel={onClose} footer={null} width={1320} centered title={null} className="wt-target-editor-modal wt-task-editor-modal" destroyOnHidden closable={false}>
      {task && (
        <div className="wt-target-editor-modal__content">
          <div className="wt-target-editor-modal__header">
            <div className="wt-target-editor-modal__header-left">
              <div className="wt-target-editor-modal__header-top">
                <span className="wt-target-editor-modal__badge">
                  <FolderFilled />
                  <span>{taskHeaderName}</span>
                </span>
                <span className="wt-target-editor-modal__project-name">{projectOverview.title}</span>
              </div>
            </div>
            <Space size={4}>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    {
                      key: 'delete',
                      label: '删除任务',
                      icon: <DeleteOutlined />,
                      danger: true
                    }
                  ],
                  onClick: ({ key }) => {
                    if (key === 'delete') handleDeleteCurrent()
                  }
                }}
              >
                <Button type="text" icon={<EllipsisOutlined />} disabled={readonly || !canDeleteTask} />
              </Dropdown>
              <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
            </Space>
          </div>
          <div className="wt-project-detail wt-target-editor">
            <div className="wt-target-editor__main">
              <div className="wt-target-editor__header">
                <div className="wt-target-editor__path">
                  {taskHeaderName} / {String(task.key).toUpperCase()}
                </div>
                {parentTaskBadge ? (
                  <div className="wt-target-editor__path" style={{ marginTop: 6 }}>
                    <HomeOutlined style={{ marginRight: 6 }} />
                    {parentTaskBadge}
                  </div>
                ) : null}
                <Typography.Title level={3}>
                  {editingTaskField === 'title' ? (
                    <Input
                      autoFocus
                      value={titleDraft}
                      onChange={e => setTitleDraft(e.target.value)}
                      onBlur={commitTitle}
                      onPressEnter={commitTitle}
                      variant="borderless"
                      style={{ padding: 0, width: 520 }}
                    />
                  ) : (
                    <span
                      style={{ cursor: blockTaskInfoFields ? 'default' : 'text' }}
                      onClick={() => {
                        if (blockTaskInfoFields) return
                        setTitleDraft(task.title)
                        setEditingTaskField('title')
                      }}
                    >
                      {task.title}
                    </span>
                  )}
                </Typography.Title>
              </div>

              <div className="wt-target-editor__meta">
                <div className="wt-target-editor__meta-grid">
                  <span className="wt-target-editor__meta-item wt-target-editor__meta-item--stack wt-target-editor__meta-item--status">
                    <WorkflowStatusEditorRing status={task.status} />
                    <span className="wt-target-editor__meta-text">
                      <span className="wt-target-editor__meta-main">
                        {editingTaskField === 'status' ? (
                          <Select
                            autoFocus
                            size="small"
                            open
                            value={task.status}
                            onChange={value => {
                              updateTask({ status: value as TaskManageRecord['status'] })
                              setEditingTaskField(null)
                            }}
                            onBlur={() => setEditingTaskField(null)}
                            options={[
                              { value: '未开始', label: '未开始' },
                              { value: '进行中', label: '进行中' },
                              { value: '搁置中', label: '搁置中' },
                              { value: '已完成', label: '已完成' },
                              { value: '关闭', label: '关闭' }
                            ]}
                            style={{ width: 120 }}
                          />
                        ) : (
                          <span style={{ cursor: canEditStatusFields ? 'pointer' : 'default' }} onClick={() => canEditStatusFields && setEditingTaskField('status')}>
                            {task.status}
                          </span>
                        )}
                      </span>
                      <span className="wt-target-editor__meta-sub">当前状态</span>
                    </span>
                  </span>

                  <span className="wt-target-editor__meta-item wt-target-editor__meta-item--stack">
                    <Avatar size={34} className={`wt-target-editor__meta-avatar ${UNIFIED_OWNER_AVATAR_CLASS}${task.owner?.trim() ? '' : ' wt-reports-detail__owner-avatar--empty'}`}>
                      {task.owner?.trim() ? unifiedOwnerAvatarInitials(task.owner) : <UserOutlined />}
                    </Avatar>
                    <span className="wt-target-editor__meta-text">
                      <span className="wt-target-editor__meta-main">
                        {editingTaskField === 'owner' ? (
                          <Select
                            autoFocus
                            size="small"
                            value={task.owner}
                            onChange={value => {
                              updateTask({ owner: value })
                              setEditingTaskField(null)
                            }}
                            allowClear
                            onClear={() => {
                              updateTask({ owner: undefined })
                              setEditingTaskField(null)
                            }}
                            onBlur={() => setEditingTaskField(null)}
                            options={members.map(m => ({ value: m.name, label: m.name }))}
                            style={{ minWidth: 150 }}
                          />
                        ) : (
                          <span style={{ cursor: canEditStatusFields ? 'pointer' : 'default' }} onClick={() => canEditStatusFields && setEditingTaskField('owner')}>
                            {task.owner ?? '负责人'}
                          </span>
                        )}
                      </span>
                      <span className="wt-target-editor__meta-sub">负责人</span>
                    </span>
                  </span>

                  <span className="wt-target-editor__meta-item wt-target-editor__meta-item--stack">
                    <span className="wt-target-editor__meta-date-ring" aria-hidden>
                      <CalendarOutlined />
                    </span>
                    {editingTaskField === 'start' ? (
                      <span className="wt-target-editor__meta-text">
                        <span className="wt-target-editor__meta-main">
                          <DatePicker
                            autoFocus
                            size="small"
                            open
                            value={parseTaskDateValue(task.start)}
                            format="YYYY年M月D日"
                            onChange={date => {
                              if (date) updateTask({ start: date.format('YYYY-MM-DD') })
                              setEditingTaskField(null)
                            }}
                            onOpenChange={open => {
                              if (!open) setEditingTaskField(null)
                            }}
                          />
                        </span>
                      </span>
                    ) : !task.start ? (
                      <span className="wt-target-editor__meta-text wt-target-editor__meta-text--single" style={{ cursor: canEditStatusFields ? 'pointer' : 'default' }} onClick={() => canEditStatusFields && setEditingTaskField('start')}>
                        开始时间
                      </span>
                    ) : (
                      <span className="wt-target-editor__meta-text">
                        <span className="wt-target-editor__meta-main">
                          <span style={{ cursor: canEditStatusFields ? 'pointer' : 'default' }} onClick={() => canEditStatusFields && setEditingTaskField('start')}>
                            {formatTaskDateDisplay(task.start)}
                          </span>
                        </span>
                        <span className="wt-target-editor__meta-sub">开始时间</span>
                      </span>
                    )}
                  </span>

                  <span className="wt-target-editor__meta-item wt-target-editor__meta-item--stack">
                    <span className="wt-target-editor__meta-date-ring" aria-hidden>
                      <CalendarOutlined />
                    </span>
                    {editingTaskField === 'end' ? (
                      <span className="wt-target-editor__meta-text">
                        <span className="wt-target-editor__meta-main">
                          <DatePicker
                            autoFocus
                            size="small"
                            open
                            value={parseTaskDateValue(task.end)}
                            format="YYYY年M月D日"
                            onChange={date => {
                              if (date) updateTask({ end: date.format('YYYY-MM-DD') })
                              setEditingTaskField(null)
                            }}
                            onOpenChange={open => {
                              if (!open) setEditingTaskField(null)
                            }}
                          />
                        </span>
                      </span>
                    ) : !task.end ? (
                      <span className="wt-target-editor__meta-text wt-target-editor__meta-text--single" style={{ cursor: canEditStatusFields ? 'pointer' : 'default' }} onClick={() => canEditStatusFields && setEditingTaskField('end')}>
                        截止时间
                      </span>
                    ) : (
                      <span className="wt-target-editor__meta-text">
                        <span className="wt-target-editor__meta-main">
                          <span style={{ cursor: canEditStatusFields ? 'pointer' : 'default' }} onClick={() => canEditStatusFields && setEditingTaskField('end')}>
                            {formatTaskDateDisplay(task.end)}
                          </span>
                        </span>
                        <span className="wt-target-editor__meta-sub">截止时间</span>
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div className="wt-target-editor__tabs">
                <span className={taskEditorTab === '任务信息' ? 'wt-target-editor__tab wt-target-editor__tab--active' : 'wt-target-editor__tab'} onClick={() => setTaskEditorTab('任务信息')}>
                  任务信息
                </span>
                <span className={taskEditorTab === '子任务' ? 'wt-target-editor__tab wt-target-editor__tab--active' : 'wt-target-editor__tab'} onClick={() => setTaskEditorTab('子任务')}>
                  子任务 {taskEditorSubtasks.length > 0 ? taskEditorSubtasks.length : ''}
                </span>
                <span className={taskEditorTab === '附件' ? 'wt-target-editor__tab wt-target-editor__tab--active' : 'wt-target-editor__tab'} onClick={() => setTaskEditorTab('附件')}>
                  附件 {taskAttachments.length > 0 ? taskAttachments.length : ''}
                </span>
              </div>

              {taskEditorTab === '任务信息' ? (
                <>
                  <div className="wt-target-editor__section">
                    <div className="wt-target-editor__labels">
                      {!hideProjectStageRow ? <span>项目阶段</span> : null}
                      <span>优先级</span>
                      <span>标签</span>
                    </div>
                    <div className="wt-target-editor__values">
                      {!hideProjectStageRow ? (
                        <span>
                          {isSubtaskDetail ? (
                            <Typography.Text type="secondary">{task.stage ?? taskStageOptions[0] ?? DEFAULT_TASK_STAGE_TITLES[0]}（随父任务）</Typography.Text>
                          ) : editingTaskField === 'stage' ? (
                            <Select
                              autoFocus
                              size="small"
                              open
                              value={task.stage ?? ''}
                              onChange={value => {
                                updateTask({ stage: value })
                                setEditingTaskField(null)
                              }}
                              onBlur={() => setEditingTaskField(null)}
                              options={(taskStageOptions.length ? taskStageOptions : DEFAULT_TASK_STAGE_TITLES).map(x => ({ value: x, label: x }))}
                              style={{ minWidth: 140 }}
                            />
                          ) : (
                            <span style={{ cursor: blockTaskInfoFields ? 'default' : 'pointer' }} onClick={() => !blockTaskInfoFields && setEditingTaskField('stage')}>
                              {task.stage ?? taskStageOptions[0] ?? DEFAULT_TASK_STAGE_TITLES[0]}
                            </span>
                          )}
                        </span>
                      ) : null}
                      <span>
                        {editingTaskField === 'priority' ? (
                          <Select
                            autoFocus
                            size="small"
                            open
                            value={task.priority}
                            onChange={value => {
                              updateTask({ priority: value as TaskManageRecord['priority'] })
                              setEditingTaskField(null)
                            }}
                            onBlur={() => setEditingTaskField(null)}
                            options={TASK_PRIORITY_LEVELS.map((value: TaskPriorityLevel) => ({
                              value,
                              label: <PriorityWithMarks priority={value} />
                            }))}
                            style={{ width: 152 }}
                          />
                        ) : (
                          <span style={{ cursor: blockTaskInfoFields ? 'default' : 'pointer' }} onClick={() => !blockTaskInfoFields && setEditingTaskField('priority')}>
                            <PriorityWithMarks priority={task.priority} />
                          </span>
                        )}
                      </span>
                      <span>+ 需求bug紧急</span>
                    </div>
                  </div>
                  <div className="wt-target-editor__field">
                    <Typography.Text strong>描述</Typography.Text>
                    {editingTaskField === 'description' ? (
                      <Input.TextArea
                        autoFocus
                        value={descriptionDraft}
                        onChange={e => setDescriptionDraft(e.target.value)}
                        onBlur={() => commitDescription()}
                        onKeyDown={e => {
                          // 多行输入时，避免每次敲键触发活动记录；用 Ctrl+Enter 作为“提交”
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault()
                            commitDescription()
                          }
                        }}
                        autoSize={{ minRows: 3, maxRows: 8 }}
                        style={{ marginTop: 8 }}
                      />
                    ) : (
                      <Typography.Paragraph style={{ marginTop: 8, cursor: blockTaskInfoFields ? 'default' : 'text' }} onClick={() => !blockTaskInfoFields && setEditingTaskField('description')}>
                        {task.description?.trim() ? task.description : '无'}
                      </Typography.Paragraph>
                    )}
                  </div>
                </>
              ) : (
                <div className="wt-target-editor__field">
                  {taskEditorTab === '子任务' ? (
                    <div className="wt-task-subtask">
                      <div className="wt-task-subtask__top">
                        <Space size={12}>
                          <Typography.Text type="secondary">共 {taskEditorSubtasks.length} 个任务</Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12, cursor: 'pointer', userSelect: 'none' }} onClick={() => setHideCompletedSubtasks(prev => !prev)}>
                            {hideCompletedSubtasks ? <EyeOutlined /> : <EyeInvisibleOutlined />} {hideCompletedSubtasks ? '显示已完成子任务' : '隐藏已完成子任务'}
                          </Typography.Text>
                        </Space>
                        <Space size={8}>
                          {taskEditorSubtasks.length > 0 ? (
                            <>
                              <div className="wt-task-subtask__progress">
                                <div className="wt-task-subtask__progress-fill" style={{ width: `${subtaskProgressPercent}%` }} />
                              </div>
                              <Typography.Text type="secondary">
                                {subtaskProgressPercent}% ({completedSubtaskCount}/{taskEditorSubtasks.length})
                              </Typography.Text>
                            </>
                          ) : null}
                          <Button
                            type="link"
                            size="small"
                            onClick={() => {
                              if (blockCreateSubtask) return
                              if (!task || task.kind !== 'task') return
                              setCreatingSubtask(true)
                            }}
                            disabled={blockCreateSubtask}
                          >
                            + 新建
                          </Button>
                        </Space>
                      </div>
                      <div className="wt-task-subtask__list">
                        {visibleTaskEditorSubtasks.map(sub => (
                          <div key={sub.key} className="wt-task-subtask__item" onMouseEnter={() => setHoveredSubtaskKey(sub.key)} onMouseLeave={() => setHoveredSubtaskKey(prev => (prev === sub.key ? null : prev))}>
                            <div className="wt-task-subtask__left" onClick={() => !readonly && openTaskDetail(sub.key)} style={{ cursor: readonly ? 'default' : 'pointer' }}>
                              <span className="wt-task-page__task-icon">
                                <FileTextOutlined />
                              </span>
                              <span className="wt-task-subtask__id">{sub.id}</span>
                              {editingSubtaskKey === sub.key ? (
                                <Input
                                  autoFocus
                                  size="small"
                                  value={editingSubtaskTitle}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => setEditingSubtaskTitle(e.target.value)}
                                  onPressEnter={e => {
                                    e.preventDefault()
                                    commitRenameSubtask()
                                  }}
                                  onBlur={commitRenameSubtask}
                                  style={{ width: 260 }}
                                />
                              ) : (
                                <span>{sub.title}</span>
                              )}
                            </div>
                            <div className="wt-task-subtask__actions" onClick={e => e.stopPropagation()}>
                              <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                className={hoveredSubtaskKey === sub.key || editingSubtaskKey === sub.key ? 'wt-task-subtask__action-btn wt-task-subtask__action-btn--visible' : 'wt-task-subtask__action-btn'}
                                onClick={() => {
                                  if (readonly) return
                                  setEditingSubtaskKey(sub.key)
                                  setEditingSubtaskTitle(sub.title)
                                  setEditingSubtaskMeta(null)
                                }}
                                disabled={readonly}
                              />
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                className={hoveredSubtaskKey === sub.key || editingSubtaskKey === sub.key ? 'wt-task-subtask__action-btn wt-task-subtask__action-btn--visible' : 'wt-task-subtask__action-btn'}
                                onClick={() => !readonly && deleteSubtask(sub.key)}
                                disabled={readonly}
                              />
                            </div>
                            <div className="wt-task-subtask__right">
                              {editingSubtaskMeta?.key === sub.key && editingSubtaskMeta.field === 'end' ? (
                                <DatePicker
                                  autoFocus
                                  size="small"
                                  open
                                  value={parseTaskDateValue(sub.end)}
                                  format="YYYY年M月D日"
                                  onChange={date => {
                                    updateSubtask(sub.key, { end: date ? date.format('YYYY-MM-DD') : '' })
                                    setEditingSubtaskMeta(null)
                                  }}
                                  onOpenChange={open => {
                                    if (!open) setEditingSubtaskMeta(null)
                                  }}
                                  onClick={e => e.stopPropagation()}
                                />
                              ) : (
                                <span
                                  onClick={e => {
                                    e.stopPropagation()
                                    if (readonly) return
                                    setEditingSubtaskMeta({ key: sub.key, field: 'end' })
                                  }}
                                  style={{ cursor: readonly ? 'default' : 'pointer' }}
                                >
                                  {formatTaskDateDisplay(sub.end) || '—'}
                                </span>
                              )}

                              {editingSubtaskMeta?.key === sub.key && editingSubtaskMeta.field === 'status' ? (
                                <Select
                                  autoFocus
                                  size="small"
                                  open
                                  value={sub.status}
                                  onChange={value => {
                                    updateSubtask(sub.key, { status: value as TaskManageRecord['status'] })
                                    setEditingSubtaskMeta(null)
                                  }}
                                  onBlur={() => setEditingSubtaskMeta(null)}
                                  options={[
                                    { value: '未开始', label: '未开始' },
                                    { value: '进行中', label: '进行中' },
                                    { value: '搁置中', label: '搁置中' },
                                    { value: '已完成', label: '已完成' },
                                    { value: '关闭', label: '关闭' }
                                  ]}
                                  style={{ width: 92 }}
                                  onClick={e => e.stopPropagation()}
                                />
                              ) : (
                                <Tag
                                  color={sub.status === '进行中' ? 'gold' : sub.status === '已完成' ? 'cyan' : sub.status === '搁置中' ? 'orange' : sub.status === '关闭' ? 'green' : 'red'}
                                  onClick={e => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (readonly) return
                                    setEditingSubtaskMeta({ key: sub.key, field: 'status' })
                                  }}
                                  style={{ cursor: readonly ? 'default' : 'pointer' }}
                                >
                                  {sub.status}
                                </Tag>
                              )}

                              {editingSubtaskMeta?.key === sub.key && editingSubtaskMeta.field === 'owner' ? (
                                <Select
                                  autoFocus
                                  size="small"
                                  value={sub.owner}
                                  onChange={value => {
                                    updateSubtask(sub.key, { owner: value })
                                    setEditingSubtaskMeta(null)
                                  }}
                                  onBlur={() => setEditingSubtaskMeta(null)}
                                  options={members.map(m => ({ value: m.name, label: m.name }))}
                                  style={{ minWidth: 112 }}
                                  onClick={e => e.stopPropagation()}
                                />
                              ) : (
                                <span
                                  onClick={e => {
                                    e.stopPropagation()
                                    if (readonly) return
                                    setEditingSubtaskMeta({ key: sub.key, field: 'owner' })
                                  }}
                                  style={{ cursor: readonly ? 'default' : 'pointer' }}
                                >
                                  <Avatar size={20} style={{ background: '#4f46e5', color: '#fff', fontSize: 10, cursor: 'pointer' }}>
                                    {sub.owner.slice(0, 2)}
                                  </Avatar>
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {visibleTaskEditorSubtasks.length === 0 ? (
                          <div className="wt-attachment-empty">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hideCompletedSubtasks ? '暂无未完成子任务' : '暂无子任务'} />
                          </div>
                        ) : null}
                        {creatingSubtask ? (
                          <div className="wt-task-subtask__item">
                            <div className="wt-task-subtask__left" style={{ flex: 1 }}>
                              <Input
                                autoFocus
                                value={newSubtaskTitle}
                                onChange={e => setNewSubtaskTitle(e.target.value)}
                                onPressEnter={() => {
                                  openCreateSubtaskModal()
                                }}
                                placeholder="输入子任务名称"
                                size="small"
                              />
                            </div>
                            <div className="wt-task-subtask__right">
                              <Button
                                type="link"
                                size="small"
                                onClick={() => {
                                  openCreateSubtaskModal()
                                }}
                              >
                                确认
                              </Button>
                              <Button
                                type="text"
                                size="small"
                                onClick={() => {
                                  setCreatingSubtask(false)
                                  setNewSubtaskTitle('')
                                }}
                              >
                                取消
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="wt-attachment-block">
                      <div className="wt-attachment-toolbar">
                        <Space size={12}>
                          <Typography.Text type="secondary">共 {taskAttachments.length} 个附件</Typography.Text>
                        </Space>
                        <Space size={8}>
                          {taskAttachments.length > 0 ? (
                            <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => triggerDownloadAllTaskAttachments(taskAttachments)}>
                              下载全部
                            </Button>
                          ) : null}
                          <Upload
                            disabled={blockTaskAttachments}
                            multiple
                            showUploadList={false}
                            beforeUpload={file => {
                              if (blockTaskAttachments) return false
                              if (!task) return false
                              addTaskAttachmentFromFile(task.key, file)
                              return false
                            }}
                          >
                            <Button type="text" size="small" disabled={blockTaskAttachments}>
                              + 添加附件
                            </Button>
                          </Upload>
                        </Space>
                      </div>
                      {taskAttachments.length === 0 ? (
                        <div className="wt-attachment-empty">
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
                        </div>
                      ) : (
                        <div className="wt-target-attachment-list">
                          {taskAttachments.map(item => (
                            <div key={item.id} className="wt-target-attachment-row">
                              <TaskAttachmentFileIcon name={item.name} />
                              <div className="wt-target-attachment-row__body">
                                <div className="wt-target-attachment-row__name">{item.name}</div>
                                <div className="wt-target-attachment-row__meta">
                                  {formatTaskAttachmentSize(item.sizeBytes)} 来自 {item.uploader} | {dayjs(item.createdAt).format('M月D日 HH:mm')}
                                </div>
                              </div>
                              <div className="wt-target-attachment-row__actions">
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<DownloadOutlined />}
                                  aria-label="下载"
                                  onClick={e => {
                                    e.stopPropagation()
                                    triggerDownloadTaskAttachment(item)
                                  }}
                                />
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  aria-label="删除"
                                  disabled={blockTaskAttachments}
                                  onClick={e => {
                                    e.stopPropagation()
                                    if (blockTaskAttachments) return
                                    if (!task) return
                                    removeTaskAttachmentItem(task.key, item.id)
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="wt-target-editor__footer-meta">
                <span className="wt-target-editor-modal__meta-text">
                  创建于 {formatAuditZh(task?.createdAt)} · 更新于 {formatAuditZh(task?.updatedAt ?? task?.createdAt)}
                </span>
              </div>
            </div>

            <div className="wt-target-editor__side">
              <div className="wt-target-editor__side-tabs">
                {(['评论', '活动', '流转', '状态审批'] as TargetSideTab[]).map(tab => (
                  <span key={tab} className={targetSideTab === tab ? 'wt-target-editor__side-tab wt-target-editor__side-tab--active' : 'wt-target-editor__side-tab'} onClick={() => setTargetSideTab(tab)}>
                    {tab}
                  </span>
                ))}
              </div>
              {targetSideTab === '评论' ? (
                <div className="wt-target-activity">
                  {totalCommentsForSide === 0 ? (
                    <div className="wt-target-editor__side-empty">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无评论" />
                    </div>
                  ) : (
                    <>
                      {visibleCommentsForSide.map(item => (
                        <div key={item.id} className="wt-target-activity__item">
                          <div className="wt-target-activity__head">
                            <Avatar size={24} style={{ background: '#ffccc7', color: '#cf1322', fontSize: 10 }}>
                              {item.actor.slice(0, 2)}
                            </Avatar>
                            <span className="wt-target-activity__actor">{item.actor}</span>
                            <span className="wt-target-activity__time">{formatDateTime(item.createdAt)}</span>
                          </div>
                          <div className="wt-target-activity__body">
                            <div className="wt-target-activity__line">{item.content}</div>
                          </div>
                        </div>
                      ))}
                      {hasMoreCommentsForSide ? (
                        <div style={{ padding: '6px 0 2px', textAlign: 'center' }}>
                          <Button type="link" size="small" onClick={() => setTargetSidePanelVisibleCount(c => c + TARGET_SIDE_PANEL_PAGE_SIZE)}>
                            显示更多
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : targetSideTab === '活动' ? (
                <div className="wt-target-activity">
                  {activityFeedForSide.length === 0 ? (
                    <div className="wt-target-editor__side-empty">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无活动记录" />
                    </div>
                  ) : (
                    <>
                      {visibleActivityFeedForSide.map(item => (
                        <div key={item.id} className="wt-target-activity__item">
                          <div className="wt-target-activity__head">
                            <Avatar size={24} style={{ background: '#ffccc7', color: '#cf1322', fontSize: 10 }}>
                              {item.actor.slice(0, 2)}
                            </Avatar>
                            <span className="wt-target-activity__actor">{item.actor}</span>
                            <span className="wt-target-activity__time">{formatDateTime(item.createdAt)}</span>
                          </div>
                          <div className="wt-target-activity__body">
                            {item.fieldLabel === '参与人' ? (
                              <ActivityParticipantActivityBody before={item.before} after={item.after} />
                            ) : (
                              <>
                                <div className="wt-target-activity__line">{item.fieldLabel}</div>
                                <div className="wt-target-activity__change">
                                  <span>{formatActivityFieldDisplay(item.fieldLabel, item.before)}</span>
                                  <span className="wt-target-activity__arrow">→</span>
                                  <span>{formatActivityFieldDisplay(item.fieldLabel, item.after)}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      {hasMoreActivityFeedForSide ? (
                        <div style={{ padding: '6px 0 2px', textAlign: 'center' }}>
                          <Button type="link" size="small" onClick={() => setTargetSidePanelVisibleCount(c => c + TARGET_SIDE_PANEL_PAGE_SIZE)}>
                            显示更多
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : targetSideTab === '流转' ? (
                <div className="wt-target-flow">
                  {statusFlowForSide.length === 0 ? (
                    <div className="wt-target-editor__side-empty">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无状态流转记录" />
                    </div>
                  ) : (
                    <>
                      {visibleStatusFlowForSide.map((item, idx) => (
                        <div key={item.id} className="wt-target-flow__item">
                          <div className="wt-target-flow__left">
                            <WorkflowStatusEditorRing status={item.before} />
                            <span className="wt-target-flow__dot" />
                            {idx < visibleStatusFlowForSide.length - 1 ? <span className="wt-target-flow__line" /> : null}
                          </div>
                          <div className="wt-target-flow__right">
                            <div className="wt-target-flow__head">
                              <Avatar size={24} className={UNIFIED_OWNER_AVATAR_CLASS}>
                                {unifiedOwnerAvatarInitials(item.actor)}
                              </Avatar>
                              <span className="wt-target-activity__actor">{item.actor}</span>
                              <span className="wt-target-activity__time">{formatDateTime(item.createdAt)}</span>
                            </div>
                            <div className="wt-target-flow__change">
                              <UnifiedWorkflowStatusTag status={item.before} />
                              <span className="wt-target-activity__arrow">→</span>
                              <UnifiedWorkflowStatusTag status={item.after} />
                            </div>
                          </div>
                        </div>
                      ))}
                      {hasMoreStatusFlowForSide ? (
                        <div style={{ padding: '6px 0 2px', textAlign: 'center' }}>
                          <Button type="link" size="small" onClick={() => setTargetSidePanelVisibleCount(c => c + TARGET_SIDE_PANEL_PAGE_SIZE)}>
                            显示更多
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="wt-target-editor__side-empty">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`暂无${targetSideTab}`} />
                  </div>
                  <div className="wt-target-editor__comment-box">按 &quot;M&quot; 键输入评论</div>
                </>
              )}
              {targetSideTab === '评论' ? (
                <div className="wt-target-editor__comment-box">
                  <TargetFeedCommentComposer
                    value={targetCommentInput}
                    onChange={setTargetCommentInput}
                    disabled={targetCommentInputDisabled}
                    hotkeyEnabled={Boolean(task)}
                    onSubmit={() => {
                      if (!currentSideKey || targetCommentInputDisabled) return
                      addTargetComment(currentSideKey)
                    }}
                  />
                </div>
              ) : null}
              <div className="wt-target-editor__participants">
                <span className="wt-target-editor__participants-label">参与人</span>
                {taskParticipants.map(name => (
                  <span key={name} className="wt-target-editor__participant">
                    <Avatar size={20} style={{ background: '#7b8cff', fontSize: 11 }}>
                      {name.slice(0, 2)}
                    </Avatar>
                    <Button
                      type="text"
                      size="small"
                      className="wt-target-editor__participant-remove"
                      disabled={blockTaskInfoFields}
                      onClick={() => {
                        if (blockTaskInfoFields) return
                        updateTaskParticipants(
                          task.key,
                          taskParticipants.filter(p => p !== name)
                        )
                      }}
                    >
                      ×
                    </Button>
                  </span>
                ))}
                <Dropdown
                  trigger={['click']}
                  disabled={blockTaskInfoFields}
                  menu={{
                    items: (() => {
                      const available = members.filter(m => !taskParticipants.includes(m.name))
                      if (available.length === 0) return [{ key: 'none', label: '暂无可添加成员', disabled: true }]
                      return available.map(m => ({ key: m.key, label: m.name }))
                    })(),
                    onClick: ({ key }) => {
                      if (blockTaskInfoFields) return
                      const picked = members.find(m => m.key === String(key))
                      if (!picked) return
                      updateTaskParticipants(task.key, [...taskParticipants, picked.name])
                    }
                  }}
                >
                  <Button type="text" size="small" style={{ padding: 0, minWidth: 20 }} disabled={blockTaskInfoFields}>
                    +
                  </Button>
                </Dropdown>
              </div>
            </div>
          </div>
        </div>
      )}
      <Modal open={createSubtaskModalOpen} onCancel={() => setCreateSubtaskModalOpen(false)} title="新建子任务" width={880} destroyOnHidden footer={null}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <Typography.Text strong>标题 *</Typography.Text>
            <Input style={{ marginTop: 8 }} value={createSubtaskDraft.title} onChange={e => setCreateSubtaskDraft(p => ({ ...p, title: e.target.value }))} placeholder="请输入标题" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Typography.Text strong>类型 *</Typography.Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                value={createSubtaskDraft.taskType}
                onChange={value =>
                  setCreateSubtaskDraft(p => ({
                    ...p,
                    taskType: value as SubtaskCreateTaskType,
                    templateFields: {}
                  }))
                }
                options={createSubtaskTypeSelectOptions}
              />
            </div>
            <div>
              <Typography.Text strong>负责人</Typography.Text>
              <Select style={{ width: '100%', marginTop: 8 }} value={createSubtaskDraft.owner} placeholder="选择负责人" onChange={value => setCreateSubtaskDraft(p => ({ ...p, owner: value }))} options={members.map(m => ({ value: m.name, label: m.name }))} allowClear />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Typography.Text strong>开始时间</Typography.Text>
              <DatePicker style={{ width: '100%', marginTop: 8 }} value={parseTaskDateValue(createSubtaskDraft.start)} format="YYYY年M月D日" onChange={d => setCreateSubtaskDraft(p => ({ ...p, start: d ? d.format('YYYY-MM-DD') : '' }))} />
            </div>
            <div>
              <Typography.Text strong>截止时间</Typography.Text>
              <DatePicker style={{ width: '100%', marginTop: 8 }} value={parseTaskDateValue(createSubtaskDraft.end)} format="YYYY年M月D日" onChange={d => setCreateSubtaskDraft(p => ({ ...p, end: d ? d.format('YYYY-MM-DD') : '' }))} />
            </div>
          </div>
          {!hideProjectStageRow ? (
            <div>
              <Typography.Text strong>项目阶段</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                {task?.stage ?? taskStageOptions[0] ?? DEFAULT_TASK_STAGE_TITLES[0]}（与父任务一致，不可单独修改）
              </Typography.Paragraph>
            </div>
          ) : null}
          <div>
            <Typography.Text strong>优先级</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={createSubtaskDraft.priority}
              onChange={value => setCreateSubtaskDraft(p => ({ ...p, priority: value as TaskManageRecord['priority'] }))}
              options={TASK_PRIORITY_LEVELS.map((value: TaskPriorityLevel) => ({
                value,
                label: <PriorityWithMarks priority={value} />
              }))}
            />
          </div>
          {createSubtaskTemplateFields.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {createSubtaskTemplateFields.map(field => (
                <div key={field.key}>
                  <Typography.Text strong>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </Typography.Text>
                  <Input
                    style={{ marginTop: 8 }}
                    value={createSubtaskDraft.templateFields[field.key] ?? ''}
                    placeholder={field.placeholder}
                    onChange={e =>
                      setCreateSubtaskDraft(p => ({
                        ...p,
                        templateFields: {
                          ...p.templateFields,
                          [field.key]: e.target.value
                        }
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          ) : null}
          <div>
            <Typography.Text strong>参与人</Typography.Text>
            <Select mode="multiple" style={{ width: '100%', marginTop: 8 }} value={createSubtaskDraft.participants} placeholder="选择参与人" onChange={value => setCreateSubtaskDraft(p => ({ ...p, participants: value }))} options={members.map(m => ({ value: m.name, label: m.name }))} />
          </div>
          <div>
            <Typography.Text strong>描述</Typography.Text>
            <Input.TextArea style={{ marginTop: 8 }} autoSize={{ minRows: 4, maxRows: 8 }} value={createSubtaskDraft.description} onChange={e => setCreateSubtaskDraft(p => ({ ...p, description: e.target.value }))} placeholder="请输入描述" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button onClick={() => setCreateSubtaskModalOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitCreateSubtask}>
              确定
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  )
}
