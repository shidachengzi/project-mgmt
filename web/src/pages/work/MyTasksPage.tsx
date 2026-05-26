import { AppstoreOutlined, CalendarOutlined, CaretDownOutlined, CaretUpOutlined, CloseOutlined, DeleteOutlined, DownOutlined, FilterOutlined, MoreOutlined, PlusOutlined, SearchOutlined, StarFilled, TableOutlined } from '@ant-design/icons'
import { Avatar, Button, DatePicker, Divider, Dropdown, Empty, Input, Modal, Pagination, Popover, Progress, Select, Space, Switch, Typography, message } from 'antd'
import { MyTasksBoardBodySkeleton, MyTasksTableBodySkeleton } from './MyTasksContentSkeleton'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { backendPersonalDeskProjectId, isBackendPersonalDeskProjectId, personalDeskSummaryForBackendUser } from '../../entities/project/lib/personalDesk'
import { getProjectTemplateConfig, DEFAULT_TASK_STAGE_TITLES } from '../../entities/project/config/projectTemplates'
import { encodeTargetPayload, decodeTargetPayload } from '../../features/project-detail/tasks/projectTaskAdapter'
import { useAccountStore } from '../../entities/account/model/useAccountStore'
import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { useOrgStore } from '../../entities/org/model/useOrgStore'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { fetchMyTasks, type MyTaskItemDTO } from '../../shared/api/myTasksApi'
import { deleteProjectTask, fetchProjectTasks, postProjectTask, type ProjectTaskTreeDTO } from '../../shared/api/projectTasksApi'
import { fetchMePreferences, patchMePreferences } from '../../shared/api/mePreferencesApi'
import { fetchDirectoryUsers } from '../../shared/api/directoryUsersApi'
import { fetchProjectWorkspace, patchProjectWorkspace } from '../../shared/api/projectWorkspaceApi'
import { useBackendDataStore } from '../../entities/workspace/model/backendDataStore'
import { acknowledgeCollaborativeRemoteRevision, markCollaborativeLocalMutation } from '../../shared/lib/collaborativeSyncNotify'
import { fingerprintMyTasksBuckets, useMyTasksListSync, type MyTasksBuckets } from './useMyTasksListSync'
import type { TargetActivityRecord } from '../../entities/target-feed/model/useTargetFeedStore'
import type { UserPreferencesDTO } from '../../shared/api/mePreferencesApi'
import type { ProjectSummary } from '../../entities/project/model/types'
import { UnifiedWorkflowStatusTag, UNIFIED_OWNER_AVATAR_CLASS, unifiedOwnerAvatarInitials } from '../../shared/ui/unifiedWorkflowStatusTag'

type MyTaskTab = '我负责的' | '我参与的' | '我创建的'
type BoardColumnKey = 'todo' | 'today' | 'next' | 'later'

type TaskCard = {
  id: string
  kind: 'target' | 'task'
  projectId: string
  itemKey: string
  title: string
  status: string
  type: '目标' | '任务'
  typeLabel: string
  projectTitle: string
  /** 后端任务/目标主键（真实编号）；界面可缩写展示，完整值见 title/tooltip */
  taskNumber: string
  overdue?: string
  start?: string
  ownerInitials: string
  accent: string
  owner: string
  ownerUserId?: string | null
  /** 工作区参与人解析后的用户 id */
  participantUserIds: string[]
  createdByUserId?: string | null
  createdAt?: string
  completedAt?: string
  priority: string
}

const COLUMN_META: Array<{ key: BoardColumnKey; title: string }> = [
  { key: 'todo', title: '收件箱' },
  { key: 'today', title: '今天要做' },
  { key: 'next', title: '下一步要做' },
  { key: 'later', title: '以后再做' }
]

const MY_TASK_STATUS_OPTIONS = ['未开始', '进行中', '验收中', '搁置中', '已完成', '关闭'] as const
const MY_TASK_PRIORITY_OPTIONS = ['最高', '较高', '普通', '较低', '最低'] as const

type MyTaskFilterField = 'status' | 'priority' | 'typeLabel' | 'projectTitle' | 'owner' | 'participant' | 'createdAt' | 'startDate' | 'endDate' | 'completedAt'
type MyTaskFilterOp = 'eq' | 'neq' | 'contains' | 'before' | 'after'

type MyTaskFilterRow = {
  id: string
  field: MyTaskFilterField
  op: MyTaskFilterOp
  value: string
}

const FILTER_FIELD_OPTIONS: { value: MyTaskFilterField; label: string }[] = [
  { value: 'status', label: '状态' },
  { value: 'priority', label: '优先级' },
  { value: 'typeLabel', label: '类型' },
  { value: 'projectTitle', label: '所属项目' },
  { value: 'owner', label: '负责人' },
  { value: 'participant', label: '参与人' },
  { value: 'createdAt', label: '创建时间' },
  { value: 'startDate', label: '开始时间' },
  { value: 'endDate', label: '截止时间' },
  { value: 'completedAt', label: '完成时间' }
]

function isDateFilterField(field: MyTaskFilterField): boolean {
  return field === 'createdAt' || field === 'startDate' || field === 'endDate' || field === 'completedAt'
}

function newFilterRowId() {
  return `fr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function defaultFilterRow(): MyTaskFilterRow {
  return { id: newFilterRowId(), field: 'status', op: 'eq', value: '' }
}

function opsForField(field: MyTaskFilterField): { value: MyTaskFilterOp; label: string }[] {
  if (field === 'status' || field === 'priority' || field === 'owner' || field === 'participant') {
    return [
      { value: 'eq', label: '等于' },
      { value: 'neq', label: '不等于' }
    ]
  }
  if (isDateFilterField(field)) {
    return [
      { value: 'eq', label: '等于' },
      { value: 'neq', label: '不等于' },
      { value: 'before', label: '早于' },
      { value: 'after', label: '晚于' }
    ]
  }
  return [
    { value: 'eq', label: '等于' },
    { value: 'neq', label: '不等于' },
    { value: 'contains', label: '包含' }
  ]
}

function normalizeOpForField(field: MyTaskFilterField, op: MyTaskFilterOp): MyTaskFilterOp {
  const allowed = opsForField(field).map(o => o.value)
  return (allowed.includes(op) ? op : 'eq') as MyTaskFilterOp
}

function getCardFilterFieldValue(card: TaskCard, field: MyTaskFilterField): string {
  switch (field) {
    case 'status':
      return card.status
    case 'priority':
      return card.priority
    case 'typeLabel':
      return card.typeLabel
    case 'projectTitle':
      return card.projectTitle
    default:
      return ''
  }
}

/** 将卡片上的日期字段规范为 YYYY-MM-DD，无则 null */
function parseCardDay(card: TaskCard, field: MyTaskFilterField): string | null {
  let raw: string | undefined
  switch (field) {
    case 'createdAt':
      raw = card.createdAt
      break
    case 'startDate':
      raw = card.start
      break
    case 'endDate':
      raw = card.overdue
      break
    case 'completedAt':
      raw = card.completedAt
      break
    default:
      return null
  }
  if (!raw?.trim()) return null
  const d = dayjs(raw.trim())
  if (!d.isValid()) return null
  return d.format('YYYY-MM-DD')
}

function filterRowMatches(card: TaskCard, row: MyTaskFilterRow): boolean {
  const v = row.value.trim()
  if (v === '') return true
  if (row.field === 'owner') {
    if (row.op === 'eq') return (card.ownerUserId ?? '') === v
    if (row.op === 'neq') return (card.ownerUserId ?? '') !== v
    return true
  }
  if (row.field === 'participant') {
    const list = card.participantUserIds ?? []
    if (row.op === 'eq') return list.includes(v)
    if (row.op === 'neq') return !list.includes(v)
    return true
  }
  if (isDateFilterField(row.field)) {
    const filterDay = dayjs(v, ['YYYY-MM-DD', 'YYYY/MM/DD'], true)
    if (!filterDay.isValid()) return true
    const cardDayStr = parseCardDay(card, row.field)
    if (!cardDayStr) return false
    const c = dayjs(cardDayStr, 'YYYY-MM-DD', true)
    if (!c.isValid()) return false
    switch (row.op) {
      case 'eq':
        return c.isSame(filterDay, 'day')
      case 'neq':
        return !c.isSame(filterDay, 'day')
      case 'before':
        return c.isBefore(filterDay, 'day')
      case 'after':
        return c.isAfter(filterDay, 'day')
      default:
        return true
    }
  }
  const raw = getCardFilterFieldValue(card, row.field)
  switch (row.op) {
    case 'eq':
      return raw === v
    case 'neq':
      return raw !== v
    case 'contains':
      return raw.toLowerCase().includes(v.toLowerCase())
    default:
      return true
  }
}

function cardMatchesAppliedFilters(card: TaskCard, rows: MyTaskFilterRow[]): boolean {
  if (!rows.length) return true
  return rows.every(r => filterRowMatches(card, r))
}

type AddColumnKey = 'today' | 'next' | 'later'
type AddBizType = 'goal' | 'projectTask' | 'genericTask' | 'deptMeeting'

type InlineAddDraft = {
  title: string
  bizType: AddBizType
  dueAt: dayjs.Dayjs | null
}

function findFirstStageNode(nodes: ProjectTaskTreeDTO[]): ProjectTaskTreeDTO | undefined {
  for (const n of nodes) {
    if (n.kind === 'stage') return n
    const nested = n.children?.length ? findFirstStageNode(n.children) : undefined
    if (nested) return nested
  }
  return undefined
}

const stripIdFromBoard = (prev: Record<BoardColumnKey, string[]>, id: string): Record<BoardColumnKey, string[]> => ({
  todo: prev.todo.filter(x => x !== id),
  today: prev.today.filter(x => x !== id),
  next: prev.next.filter(x => x !== id),
  later: prev.later.filter(x => x !== id)
})

const removeCardFromBoard = (prev: Record<BoardColumnKey, string[]>, id: string) => stripIdFromBoard(prev, id)

const EMPTY_BOARD: Record<BoardColumnKey, string[]> = { todo: [], today: [], next: [], later: [] }

const boardLayoutStorageKey = (userId: string) => `pm-my-tasks-board-v2-${userId}`

const RESPONSIBLE_VIEW_STORAGE_KEY = 'pm-my-tasks-responsible-view-v1'
type ResponsibleViewMode = 'board' | 'table'

function readStoredResponsibleViewMode(): ResponsibleViewMode {
  try {
    const raw = localStorage.getItem(RESPONSIBLE_VIEW_STORAGE_KEY)
    if (raw === 'table' || raw === 'board') return raw
  } catch {
    /* ignore */
  }
  return 'board'
}

function writeStoredResponsibleViewMode(mode: ResponsibleViewMode) {
  try {
    localStorage.setItem(RESPONSIBLE_VIEW_STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

/** 个人工作台新建任务/目标后写入工作区活动（与项目详情内创建记录一致） */
async function appendPersonalDeskItemCreateActivity(deskProjectId: string, itemKey: string, itemTitle: string, actorName: string, isGoal: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const ws = await fetchProjectWorkspace(deskProjectId)
  if (!ws.ok) return { ok: false, message: ws.message }
  const prevRaw = ws.data.activityByKey[itemKey]
  const prev = Array.isArray(prevRaw) ? (prevRaw as TargetActivityRecord[]) : []
  const rec: TargetActivityRecord = {
    id: `${itemKey}-create-${Date.now()}`,
    actor: actorName.trim() || '用户',
    targetTitle: itemTitle,
    fieldLabel: '创建',
    before: '无',
    after: isGoal ? '已创建目标' : '已创建任务',
    createdAt: new Date().toISOString()
  }
  return patchProjectWorkspace(deskProjectId, { activityByKey: { [itemKey]: [rec, ...prev] } })
}

function readStoredBoardLayout(userId: string): Record<BoardColumnKey, string[]> | null {
  try {
    const raw = localStorage.getItem(boardLayoutStorageKey(userId))
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<Record<BoardColumnKey, unknown>>
    const out: Record<BoardColumnKey, string[]> = { ...EMPTY_BOARD }
    ;(Object.keys(out) as BoardColumnKey[]).forEach(k => {
      const arr = o[k]
      if (Array.isArray(arr) && arr.every((x): x is string => typeof x === 'string')) {
        out[k] = arr
      }
    })
    return out
  } catch {
    return null
  }
}

function writeStoredBoardLayout(userId: string, layout: Record<BoardColumnKey, string[]>) {
  try {
    localStorage.setItem(boardLayoutStorageKey(userId), JSON.stringify(layout))
  } catch {
    /* ignore */
  }
}

/** 校验服务端/缓存中的看板 JSON，合法则返回列映射 */
function parseBoardLayoutPayload(raw: unknown): Record<BoardColumnKey, string[]> | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Partial<Record<BoardColumnKey, unknown>>
  const out: Record<BoardColumnKey, string[]> = { ...EMPTY_BOARD }
  let ok = false
  ;(Object.keys(out) as BoardColumnKey[]).forEach(k => {
    const arr = o[k]
    if (Array.isArray(arr) && arr.every((x): x is string => typeof x === 'string')) {
      out[k] = arr
      ok = true
    }
  })
  return ok ? out : null
}

function mergeBoardWithResponsibleCards(base: Record<BoardColumnKey, string[]>, responsibleCards: TaskCard[]): Record<BoardColumnKey, string[]> {
  const validIds = new Set(responsibleCards.map(card => card.id))
  const next: Record<BoardColumnKey, string[]> = {
    todo: base.todo.filter(id => validIds.has(id)),
    today: base.today.filter(id => validIds.has(id)),
    next: base.next.filter(id => validIds.has(id)),
    later: base.later.filter(id => validIds.has(id))
  }
  const assigned = new Set([...next.todo, ...next.today, ...next.next, ...next.later])
  const unassigned = responsibleCards.map(card => card.id).filter(id => !assigned.has(id))
  if (unassigned.length > 0) {
    next.todo = [...next.todo, ...unassigned]
  }
  return next
}

const personalBizTypeOptions = () => {
  const pm = getProjectTemplateConfig('project-management')
  return [
    { value: 'goal' as const, label: pm.targetTypeLabel },
    { value: 'projectTask' as const, label: pm.taskTypeLabel },
    { value: 'genericTask' as const, label: '任务' },
    { value: 'deptMeeting' as const, label: '部门会议' }
  ]
}

const getOwnerInitials = (name: string) => {
  if (!name) return 'DA'
  return name.slice(0, 2).toUpperCase()
}

const getAccentColor = (status: string) => {
  if (status === '进行中' || status === '验收中' || status === '搁置中') return '#b7eb8f'
  if (status === '已完成' || status === '关闭') return '#d9d9d9'
  return '#ffd6e7'
}

/** 与「已完成」同等视为已结束，用于完成时间与「显示已完成」筛选 */
const isTaskDoneStatus = (status: string) => status === '已完成' || status === '关闭'

/** 卡片等窄区域：展示缩写，悬停可看完整主键 */
function formatTaskItemIdForDisplay(itemKey: string): string {
  if (itemKey.length <= 16) return itemKey
  return `${itemKey.slice(0, 8)}…${itemKey.slice(-6)}`
}

function taskTypeLabelFromDescription(description: string | null | undefined, defaultProjectTaskLabel: string): string {
  const d = (description ?? '').trim()
  if (d === '任务') return '任务'
  if (d === '部门会议') return '部门会议'
  const payload = decodeTargetPayload(d)
  if (payload?.type) return payload.type
  return defaultProjectTaskLabel
}

const mapBackendDtoToTaskCard = (item: MyTaskItemDTO, projectList: ProjectSummary[]): TaskCard => {
  const project = projectList.find(p => p.id === item.projectId)
  const tmpl = getProjectTemplateConfig(project?.templateId ?? 'project-management')
  const isTarget = item.kind === 'target'
  const kind: TaskCard['kind'] = isTarget ? 'target' : 'task'
  const ownerNm = item.ownerName?.trim() || '—'
  const isPersonalDesk = isBackendPersonalDeskProjectId(item.projectId)
  const typeLabel = isTarget ? tmpl.targetTypeLabel : taskTypeLabelFromDescription(item.description, tmpl.taskTypeLabel)
  return {
    id: `${isTarget ? 'target' : 'task'}:${item.projectId}:${item.itemKey}`,
    kind,
    projectId: item.projectId,
    itemKey: item.itemKey,
    title: item.title,
    status: item.status,
    type: isTarget ? '目标' : '任务',
    typeLabel,
    projectTitle: isPersonalDesk ? '个人任务（未归属项目）' : item.projectTitle || project?.title || '—',
    taskNumber: item.itemKey,
    start: item.start || undefined,
    overdue: item.end || undefined,
    ownerInitials: getOwnerInitials(ownerNm === '—' ? '' : ownerNm),
    accent: getAccentColor(item.status),
    owner: ownerNm,
    ownerUserId: item.ownerUserId,
    participantUserIds: Array.isArray(item.participantUserIds) ? item.participantUserIds : [],
    createdByUserId: item.createdByUserId,
    createdAt: item.createdAt,
    completedAt: isTaskDoneStatus(item.status) ? item.updatedAt : undefined,
    priority: item.priority || '普通'
  }
}

const formatDetailDate = (value?: string) => {
  if (!value) return '—'
  const trimmed = value.trim()
  const d = dayjs(trimmed)
  if (d.isValid()) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return `${d.month() + 1}月${d.date()}日`
    }
    return d.format('M月D日 HH:mm')
  }
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    const month = Number(m[2])
    const day = Number(m[3])
    return `${month}月${day}日`
  }
  return value
}

const defaultDueForColumn = (col: AddColumnKey): dayjs.Dayjs => {
  const base = dayjs().startOf('day')
  if (col === 'today') return base
  if (col === 'next') return base.add(1, 'day')
  return base.add(7, 'day')
}

/** 表格列排序（与表头一致） */
type MyTasksTableSortColumn = 'taskNumber' | 'title' | 'typeLabel' | 'status' | 'owner' | 'projectTitle' | 'priority' | 'createdAt' | 'completedAt' | 'start' | 'end'

type MyTasksTableSortState = { column: MyTasksTableSortColumn | null; order: 'asc' | 'desc' }

const PRIORITY_SORT_RANK: Record<string, number> = { 最高: 0, 较高: 1, 普通: 2, 较低: 3, 最低: 4 }

function parseCardSortTime(raw: string | undefined): number {
  if (!raw?.trim()) return 0
  const d = dayjs(raw.trim())
  return d.isValid() ? d.valueOf() : 0
}

function compareTaskCardsByColumn(a: TaskCard, b: TaskCard, column: MyTasksTableSortColumn): number {
  switch (column) {
    case 'taskNumber':
      return a.taskNumber.localeCompare(b.taskNumber)
    case 'title':
      return a.title.localeCompare(b.title, 'zh-CN')
    case 'typeLabel':
      return a.typeLabel.localeCompare(b.typeLabel, 'zh-CN')
    case 'status':
      return a.status.localeCompare(b.status, 'zh-CN')
    case 'owner':
      return a.owner.localeCompare(b.owner, 'zh-CN')
    case 'projectTitle': {
      const pa = a.projectTitle || ''
      const pb = b.projectTitle || ''
      return pa.localeCompare(pb, 'zh-CN')
    }
    case 'priority': {
      const ra = PRIORITY_SORT_RANK[a.priority] ?? 99
      const rb = PRIORITY_SORT_RANK[b.priority] ?? 99
      return ra - rb
    }
    case 'createdAt':
      return parseCardSortTime(a.createdAt) - parseCardSortTime(b.createdAt)
    case 'completedAt':
      return parseCardSortTime(a.completedAt) - parseCardSortTime(b.completedAt)
    case 'start':
      return parseCardSortTime(a.start) - parseCardSortTime(b.start)
    case 'end':
      return parseCardSortTime(a.overdue) - parseCardSortTime(b.overdue)
    default:
      return 0
  }
}

function sortTaskCardsForTable(cards: TaskCard[], sort: MyTasksTableSortState): TaskCard[] {
  if (!sort.column) return cards
  const mul = sort.order === 'asc' ? 1 : -1
  const list = [...cards]
  list.sort((x, y) => mul * compareTaskCardsByColumn(x, y, sort.column!))
  return list
}

type MyTasksPageProps = {
  activeTab: MyTaskTab
  projectList: ProjectSummary[]
  onOpenItemDetail?: (project: ProjectSummary, kind: 'target' | 'task', itemKey: string) => void
  /** 从「我的任务」打开的项目详情关闭后递增，用于触发列表重新拉取 */
  detailCloseReloadToken?: number
}

export function MyTasksPage({ activeTab, projectList, onOpenItemDetail, detailCloseReloadToken }: MyTasksPageProps) {
  const meName = useAccountStore(s => s.profile.name)
  const authedUserId = useAuthStore(s => s.authedUserId)
  const orgMembers = useOrgStore(s => s.members)
  const [directoryMembers, setDirectoryMembers] = useState<{ id: string; name: string }[] | null>(null)
  const [backendTaskBuckets, setBackendTaskBuckets] = useState<{
    responsible: MyTaskItemDTO[]
    participated: MyTaskItemDTO[]
    created: MyTaskItemDTO[]
  } | null>(null)

  /** 标题搜索：输入框草稿；按 Enter 写入 searchQuery 后参与过滤 */
  const [searchDraft, setSearchDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [tableSort, setTableSort] = useState<MyTasksTableSortState>({ column: null, order: 'asc' })
  const [tablePage, setTablePage] = useState(1)
  const [tablePageSize, setTablePageSize] = useState(20)
  const [responsibleViewMode, setResponsibleViewMode] = useState<ResponsibleViewMode>(readStoredResponsibleViewMode)
  const setResponsibleViewModePersist = useCallback((mode: ResponsibleViewMode) => {
    setResponsibleViewMode(mode)
    writeStoredResponsibleViewMode(mode)
  }, [])
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)
  const [appliedFilterRows, setAppliedFilterRows] = useState<MyTaskFilterRow[]>([])
  const [filterDraftRows, setFilterDraftRows] = useState<MyTaskFilterRow[]>(() => [defaultFilterRow()])
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null)
  const [dropColumnKey, setDropColumnKey] = useState<BoardColumnKey | null>(null)
  const [dropInsert, setDropInsert] = useState<{ columnKey: BoardColumnKey; beforeId: string | null } | null>(null)
  const dropInsertRef = useRef<{ columnKey: BoardColumnKey; beforeId: string | null } | null>(null)
  const [columnCardIds, setColumnCardIds] = useState<Record<BoardColumnKey, string[]>>(EMPTY_BOARD)
  /** 与 columnCardIds 同步，供拖拽等事件里计算 next，避免在 setState 回调里做 PATCH 调度（Strict Mode / 批处理下不可靠） */
  const columnCardIdsRef = useRef<Record<BoardColumnKey, string[]>>(EMPTY_BOARD)
  const boardLayoutUserRef = useRef<string | null>(null)
  const boardSessionMutationRef = useRef(false)
  const serverBoardAppliedRef = useRef(false)
  const boardRemoteSaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  const [mePrefs, setMePrefs] = useState<'loading' | UserPreferencesDTO>('loading')

  useEffect(() => {
    if (!isBackendAuthEnabled()) {
      setDirectoryMembers(null)
      return
    }
    let cancel = false
    void (async () => {
      const users = await fetchDirectoryUsers()
      if (cancel) return
      if (users?.length) {
        setDirectoryMembers(users.map(u => ({ id: u.id, name: u.name?.trim() || u.id })))
        return
      }
      setDirectoryMembers(
        orgMembers.map(m => ({
          id: m.id,
          name: m.name?.trim() || m.id
        }))
      )
    })()
    return () => {
      cancel = true
    }
  }, [orgMembers])

  useEffect(() => {
    columnCardIdsRef.current = columnCardIds
  }, [columnCardIds])

  const scheduleBoardLayoutRemoteSave = useCallback(
    (layout: Record<BoardColumnKey, string[]>) => {
      if (!isBackendAuthEnabled() || !authedUserId) return
      if (boardRemoteSaveTimerRef.current) window.clearTimeout(boardRemoteSaveTimerRef.current)
      boardRemoteSaveTimerRef.current = window.setTimeout(() => {
        boardRemoteSaveTimerRef.current = null
        void patchMePreferences({ myTasksBoardV2: layout }).then(r => {
          if (!r.ok) message.warning(`看板布局未同步到服务器：${r.message}`)
        })
      }, 450)
    },
    [authedUserId]
  )

  useEffect(
    () => () => {
      if (boardRemoteSaveTimerRef.current) window.clearTimeout(boardRemoteSaveTimerRef.current)
    },
    []
  )

  /** 列表合并、服务端初始布局：只更新 state + localStorage，不写 preferences */
  const applyBoardLayoutMergeOnly = useCallback(
    (assign: (prev: Record<BoardColumnKey, string[]>) => Record<BoardColumnKey, string[]>) => {
      setColumnCardIds(prev => {
        const next = assign(prev)
        if (isBackendAuthEnabled() && authedUserId) {
          writeStoredBoardLayout(authedUserId, next)
        }
        return next
      })
    },
    [authedUserId]
  )

  /** 用户拖拽 / 删除 / 看板内新建：更新 state、本地缓存，并防抖 PATCH preferences */
  const commitBoardLayoutAndSyncRemote = useCallback(
    (next: Record<BoardColumnKey, string[]>) => {
      columnCardIdsRef.current = next
      setColumnCardIds(next)
      if (!isBackendAuthEnabled() || !authedUserId) return
      writeStoredBoardLayout(authedUserId, next)
      scheduleBoardLayoutRemoteSave(next)
    },
    [authedUserId, scheduleBoardLayoutRemoteSave]
  )

  useEffect(() => {
    serverBoardAppliedRef.current = false
    boardSessionMutationRef.current = false
  }, [authedUserId])

  useEffect(() => {
    if (!isBackendAuthEnabled() || !authedUserId) {
      setMePrefs({})
      return
    }
    setMePrefs('loading')
    let cancelled = false
    void fetchMePreferences().then(r => {
      if (cancelled) return
      setMePrefs(r.ok ? r.data : {})
    })
    return () => {
      cancelled = true
    }
  }, [authedUserId])

  const [listVersion, setListVersion] = useState(0)
  const myTasksListFingerprintRef = useRef<string | null>(null)
  const lastLocalMutationAtRef = useRef(0)
  const requestMyTasksReload = useCallback(() => {
    markCollaborativeLocalMutation(lastLocalMutationAtRef)
    setListVersion(v => v + 1)
  }, [])
  const [inlineAddColumn, setInlineAddColumn] = useState<AddColumnKey | null>(null)
  const [inlineAddDraft, setInlineAddDraft] = useState<InlineAddDraft>({
    title: '',
    bizType: 'projectTask',
    dueAt: null
  })

  const applyMyTasksBuckets = useCallback((buckets: MyTasksBuckets, opts?: { acknowledgeLocal?: boolean }) => {
    setBackendTaskBuckets(buckets)
    myTasksListFingerprintRef.current = fingerprintMyTasksBuckets(buckets)
    if (opts?.acknowledgeLocal) acknowledgeCollaborativeRemoteRevision()
  }, [])

  useEffect(() => {
    if (!isBackendAuthEnabled() || !authedUserId) {
      setBackendTaskBuckets(null)
      myTasksListFingerprintRef.current = null
      return
    }
    let cancelled = false
    void (async () => {
      const [r, p, c] = await Promise.all([fetchMyTasks('responsible'), fetchMyTasks('participated'), fetchMyTasks('created')])
      if (cancelled) return
      if (!r.ok || !p.ok || !c.ok) {
        const err = !r.ok ? r : !p.ok ? p : c
        message.error(err.ok === false ? err.message : '加载失败')
        applyMyTasksBuckets({ responsible: [], participated: [], created: [] }, { acknowledgeLocal: true })
        return
      }
      applyMyTasksBuckets({ responsible: r.data, participated: p.data, created: c.data }, { acknowledgeLocal: true })
    })()
    return () => {
      cancelled = true
    }
  }, [authedUserId, listVersion, applyMyTasksBuckets])

  useEffect(() => {
    if ((detailCloseReloadToken ?? 0) === 0) return
    requestMyTasksReload()
  }, [detailCloseReloadToken, requestMyTasksReload])

  const isMyTasksSyncDirty = useCallback(() => {
    return Boolean(inlineAddColumn || filterPopoverOpen || draggingCardId)
  }, [inlineAddColumn, filterPopoverOpen, draggingCardId])

  const handleMyTasksRemoteSync = useCallback(
    async (buckets: MyTasksBuckets) => {
      applyMyTasksBuckets(buckets)
      void useBackendDataStore.getState().refreshProjectsList()
    },
    [applyMyTasksBuckets]
  )

  useMyTasksListSync({
    enabled: Boolean(isBackendAuthEnabled() && authedUserId && backendTaskBuckets !== null),
    isDirty: isMyTasksSyncDirty,
    lastFingerprintRef: myTasksListFingerprintRef,
    onRemoteChange: handleMyTasksRemoteSync
  })

  useEffect(() => {
    setTableSort({ column: null, order: 'asc' })
  }, [activeTab])

  const responsibleCards = useMemo(() => (backendTaskBuckets?.responsible ?? []).map(d => mapBackendDtoToTaskCard(d, projectList)), [backendTaskBuckets, projectList])
  const participatedCards = useMemo(() => (backendTaskBuckets?.participated ?? []).map(d => mapBackendDtoToTaskCard(d, projectList)), [backendTaskBuckets, projectList])
  const createdCards = useMemo(() => (backendTaskBuckets?.created ?? []).map(d => mapBackendDtoToTaskCard(d, projectList)), [backendTaskBuckets, projectList])

  const cardsById = useMemo(() => {
    const map: Record<string, TaskCard> = {}
    responsibleCards.forEach(card => {
      map[card.id] = card
    })
    return map
  }, [responsibleCards])

  const filteredCardIds = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase()
    let list = responsibleCards.filter(card => cardMatchesAppliedFilters(card, appliedFilterRows))
    if (normalized) {
      list = list.filter(card => card.title.toLowerCase().includes(normalized))
    }
    return new Set(list.map(card => card.id))
  }, [searchQuery, responsibleCards, appliedFilterRows])

  /** 「我负责的」看板：默认不展示已完成/关闭 */
  const boardVisibleCardIds = useMemo(() => {
    const out = new Set<string>()
    for (const card of responsibleCards) {
      if (!filteredCardIds.has(card.id)) continue
      if (isTaskDoneStatus(card.status)) continue
      out.add(card.id)
    }
    return out
  }, [responsibleCards, filteredCardIds])

  /** 「我负责的」表格视图：列顺序与看板一致；表格右上角可切换「显示已完成」 */
  const responsibleTableRows = useMemo(() => {
    const rows: TaskCard[] = []
    for (const { key } of COLUMN_META) {
      for (const id of columnCardIds[key]) {
        if (!filteredCardIds.has(id)) continue
        const c = cardsById[id]
        if (!c) continue
        if (!showCompleted && isTaskDoneStatus(c.status)) continue
        rows.push(c)
      }
    }
    return rows
  }, [columnCardIds, filteredCardIds, cardsById, showCompleted])

  /**
   * 同步「我负责的」卡片与各列：切换用户时从 localStorage 恢复；同一用户刷新后恢复拖拽布局；
   * 新出现的卡片默认进收件箱。（不写服务端，避免列表刷新时频繁 PATCH）
   */
  useEffect(() => {
    if (!isBackendAuthEnabled()) return
    if (!authedUserId) {
      boardLayoutUserRef.current = null
      setColumnCardIds(EMPTY_BOARD)
      return
    }
    if (backendTaskBuckets === null) return

    const userChanged = boardLayoutUserRef.current !== authedUserId
    if (userChanged) {
      boardLayoutUserRef.current = authedUserId
    }

    applyBoardLayoutMergeOnly(prev => {
      const base = userChanged ? (readStoredBoardLayout(authedUserId) ?? EMPTY_BOARD) : prev
      return mergeBoardWithResponsibleCards(base, responsibleCards)
    })
  }, [authedUserId, backendTaskBuckets, responsibleCards, applyBoardLayoutMergeOnly])

  /** 服务端保存的看板布局到达后覆盖本地（若用户尚未在本会话中拖拽过） */
  useEffect(() => {
    if (!isBackendAuthEnabled() || !authedUserId) return
    if (backendTaskBuckets === null) return
    if (mePrefs === 'loading') return
    if (serverBoardAppliedRef.current) return
    if (boardSessionMutationRef.current) {
      serverBoardAppliedRef.current = true
      return
    }

    serverBoardAppliedRef.current = true

    const raw = mePrefs.myTasksBoardV2
    if (!raw) return

    const parsed = parseBoardLayoutPayload(raw)
    if (!parsed) return

    applyBoardLayoutMergeOnly(() => mergeBoardWithResponsibleCards(parsed, responsibleCards))
  }, [mePrefs, authedUserId, backendTaskBuckets, responsibleCards, applyBoardLayoutMergeOnly])

  const openItemDetail = (card: TaskCard) => {
    let project = projectList.find(p => p.id === card.projectId)
    if (!project && isBackendPersonalDeskProjectId(card.projectId)) {
      const deskOwnerId = card.projectId.slice(3)
      if (deskOwnerId) {
        project = personalDeskSummaryForBackendUser(deskOwnerId)
      }
    }
    if (!project) {
      message.error('未找到所属项目，请从项目列表进入后再试')
      return
    }
    onOpenItemDetail?.(project, card.kind, card.itemKey)
  }

  const deleteTaskCard = (card: TaskCard) => {
    Modal.confirm({
      title: '删除任务',
      content: `确定要删除「${card.title}」吗？删除后将无法恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        try {
          if (!card.projectId) {
            message.error('无法删除：缺少项目信息')
            return
          }
          const res = await deleteProjectTask(card.projectId, card.itemKey)
          if (!res.ok) {
            message.error(res.message)
            return
          }
          boardSessionMutationRef.current = true
          const next = removeCardFromBoard(columnCardIdsRef.current, card.id)
          commitBoardLayoutAndSyncRemote(next)
          requestMyTasksReload()
          message.success('已删除')
        } catch {
          message.error('删除失败，请稍后重试')
        }
      }
    })
  }

  const syncDropInsert = (v: { columnKey: BoardColumnKey; beforeId: string | null } | null) => {
    dropInsertRef.current = v
    setDropInsert(v)
  }

  const stripDraggedFromBoard = (cols: Record<BoardColumnKey, string[]>, draggedId: string): Record<BoardColumnKey, string[]> => ({
    todo: cols.todo.filter(id => id !== draggedId),
    today: cols.today.filter(id => id !== draggedId),
    next: cols.next.filter(id => id !== draggedId),
    later: cols.later.filter(id => id !== draggedId)
  })

  const insertCardInColumn = (prev: Record<BoardColumnKey, string[]>, columnKey: BoardColumnKey, draggedId: string, beforeId: string | null): Record<BoardColumnKey, string[]> => {
    if (beforeId === draggedId) return prev
    const next = stripDraggedFromBoard(prev, draggedId)
    const list = [...next[columnKey]]
    let insertAt = list.length
    if (beforeId != null) {
      const ix = list.indexOf(beforeId)
      if (ix >= 0) insertAt = ix
    }
    list.splice(insertAt, 0, draggedId)
    return { ...next, [columnKey]: list }
  }

  const handleDropToColumn = (columnKey: BoardColumnKey) => {
    const draggedId = draggingCardId
    if (!draggedId) return
    const hint = dropInsertRef.current
    const beforeId = hint && hint.columnKey === columnKey && hint.beforeId !== draggedId ? hint.beforeId : null
    boardSessionMutationRef.current = true
    const next = insertCardInColumn(columnCardIdsRef.current, columnKey, draggedId, beforeId)
    commitBoardLayoutAndSyncRemote(next)
    setDropColumnKey(null)
    setDraggingCardId(null)
    syncDropInsert(null)
  }

  const handleCardDragOver = (e: DragEvent, columnKey: BoardColumnKey, taskId: string, visibleOrder: string[]) => {
    e.preventDefault()
    e.stopPropagation()
    const draggedId = draggingCardId
    if (!draggedId || draggedId === taskId) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const mid = rect.top + rect.height / 2
    const idx = visibleOrder.indexOf(taskId)
    const beforeId = e.clientY < mid ? taskId : (visibleOrder[idx + 1] ?? null)
    if (beforeId === draggedId) return
    syncDropInsert({ columnKey, beforeId })
  }

  const handleCardDrop = (e: DragEvent, columnKey: BoardColumnKey) => {
    e.preventDefault()
    e.stopPropagation()
    handleDropToColumn(columnKey)
  }

  const openInlineAdd = (column: AddColumnKey) => {
    setInlineAddColumn(column)
    setInlineAddDraft({
      title: '',
      bizType: 'projectTask',
      dueAt: defaultDueForColumn(column)
    })
  }

  const toggleInlineAdd = (column: AddColumnKey) => {
    if (inlineAddColumn === column) {
      setInlineAddColumn(null)
    } else {
      openInlineAdd(column)
    }
  }

  const closeInlineAdd = () => {
    setInlineAddColumn(null)
  }

  const handleInlineAddConfirm = () => {
    void (async () => {
      if (!inlineAddColumn) return
      if (!isBackendAuthEnabled() || !authedUserId) {
        message.warning('请先使用后端登录')
        return
      }
      const title = inlineAddDraft.title.trim()
      if (!title) {
        message.warning('请输入任务标题')
        return
      }
      const ownerUserId = authedUserId
      if (!ownerUserId) {
        message.warning('请先登录')
        return
      }
      const col = inlineAddColumn
      const due = inlineAddDraft.dueAt
      const dueDateStr = due ? due.format('YYYY-MM-DD') : undefined
      /** 个人工作台：不写入业务项目，仅每人私有容器 */
      const deskProjectId = backendPersonalDeskProjectId(authedUserId)
      const tmpl = getProjectTemplateConfig('project-management')

      const taskDescription = inlineAddDraft.bizType === 'genericTask' ? '任务' : inlineAddDraft.bizType === 'deptMeeting' ? '部门会议' : '无'

      let newId = ''
      let createdRowId = ''
      const isGoal = inlineAddDraft.bizType === 'goal'

      if (isGoal) {
        const now = dayjs()
        const endD = due ?? now.add(1, 'month').startOf('day')
        const desc = encodeTargetPayload({
          type: tmpl.targetTypeLabel,
          meta: `优先级: 普通    更新时间 ${now.format('M月D日 HH:mm')}`
        })
        const post = await postProjectTask(deskProjectId, {
          title,
          kind: 'target',
          startDate: now.format('YYYY-MM-DD'),
          endDate: endD.format('YYYY-MM-DD'),
          ownerUserId,
          description: desc
        })
        if (!post.ok) {
          message.error(post.message)
          return
        }
        createdRowId = post.id
        newId = `target:${deskProjectId}:${post.id}`
      } else {
        const treeRes = await fetchProjectTasks(deskProjectId)
        if (!treeRes.ok) {
          message.error(treeRes.message)
          return
        }
        const stage = findFirstStageNode(treeRes.data)
        if (!stage) {
          message.error('个人工作台未初始化阶段，请稍后重试或联系管理员')
          return
        }
        const stageTitle = stage.stage ?? stage.title ?? DEFAULT_TASK_STAGE_TITLES[0]
        const post = await postProjectTask(deskProjectId, {
          title,
          kind: 'task',
          parentId: stage.key,
          startDate: dayjs().format('YYYY-MM-DD'),
          endDate: dueDateStr ?? null,
          ownerUserId,
          stageTitle,
          description: taskDescription
        })
        if (!post.ok) {
          message.error(post.message)
          return
        }
        createdRowId = post.id
        newId = `task:${deskProjectId}:${post.id}`
      }

      const actRes = await appendPersonalDeskItemCreateActivity(deskProjectId, createdRowId, title, meName ?? '', isGoal)
      if (!actRes.ok) {
        message.warning(`已创建，但活动记录未写入：${actRes.message}`)
      }

      requestMyTasksReload()
      boardSessionMutationRef.current = true
      const prev = columnCardIdsRef.current
      const without = stripIdFromBoard(prev, newId)
      const nextLayout = { ...without, [col]: [...without[col], newId] }
      commitBoardLayoutAndSyncRemote(nextLayout)
      message.success('已创建')
      closeInlineAdd()
    })()
  }

  const tabCardsMap: Record<MyTaskTab, TaskCard[]> = {
    我负责的: responsibleCards,
    我参与的: participatedCards,
    我创建的: createdCards
  }
  const activeCards = tabCardsMap[activeTab] ?? responsibleCards

  const filteredActiveCardIds = useMemo(() => {
    const norm = searchQuery.trim().toLowerCase()
    let base = activeCards.filter(card => showCompleted || !isTaskDoneStatus(card.status))
    base = base.filter(card => cardMatchesAppliedFilters(card, appliedFilterRows))
    if (!norm) return new Set(base.map(c => c.id))
    return new Set(base.filter(card => card.title.toLowerCase().includes(norm)).map(c => c.id))
  }, [activeCards, searchQuery, showCompleted, appliedFilterRows])

  const distinctTypeLabels = useMemo(() => {
    const s = new Set<string>()
    activeCards.forEach(c => s.add(c.typeLabel))
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [activeCards])

  const contactSelectOptions = useMemo(() => {
    const source =
      directoryMembers ??
      orgMembers.map(m => ({
        id: m.id,
        name: m.name?.trim() || m.id
      }))
    const opts = source.map(m => ({
      value: m.id,
      label: m.name?.trim() || m.id
    }))
    if (authedUserId && !opts.some(o => o.value === authedUserId)) {
      opts.unshift({ value: authedUserId, label: meName?.trim() || '我' })
    }
    return opts
  }, [directoryMembers, orgMembers, authedUserId, meName])

  const distinctProjectTitles = useMemo(() => {
    const s = new Set<string>()
    activeCards.forEach(c => {
      if (c.projectTitle.trim()) s.add(c.projectTitle)
    })
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [activeCards])

  const visibleActiveCards = activeCards.filter(card => filteredActiveCardIds.has(card.id))

  const activeTableTotal = useMemo(() => {
    if (activeTab !== '我负责的') return visibleActiveCards.length
    if (responsibleViewMode === 'table') return responsibleTableRows.length
    return 0
  }, [activeTab, responsibleViewMode, visibleActiveCards.length, responsibleTableRows.length])

  useEffect(() => {
    setTablePage(1)
  }, [searchQuery, appliedFilterRows, tableSort.column, tableSort.order, activeTab, showCompleted, tablePageSize, responsibleViewMode])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(activeTableTotal / tablePageSize) || 1)
    setTablePage(p => (p > maxPage ? maxPage : p))
  }, [activeTableTotal, tablePageSize])

  const totalVisible =
    activeTab === '我负责的' && responsibleViewMode === 'table'
      ? responsibleTableRows.length
      : Object.values(columnCardIds).reduce((count, ids) => count + ids.filter(id => boardVisibleCardIds.has(id)).length, 0)

  if (!authedUserId) {
    return (
      <div className="wt-my-tasks wt-my-tasks--gate">
        <Empty description="请先登录后查看我的任务" />
      </div>
    )
  }

  const tasksLoading = backendTaskBuckets === null

  const filterHasActiveRules = appliedFilterRows.some(r => r.value.trim() !== '')

  const updateFilterDraftRow = (rowId: string, patch: Partial<MyTaskFilterRow>) => {
    setFilterDraftRows(prev =>
      prev.map(r => {
        if (r.id !== rowId) return r
        const next = { ...r, ...patch }
        if (patch.field != null) {
          next.op = normalizeOpForField(patch.field, next.op)
          if (patch.field !== r.field) next.value = ''
        }
        return next
      })
    )
  }

  const renderMyTasksFilterControl = () => (
    <Popover
      trigger="click"
      placement="bottomLeft"
      overlayStyle={{ maxWidth: 640 }}
      open={filterPopoverOpen}
      onOpenChange={open => {
        setFilterPopoverOpen(open)
        if (open) {
          setFilterDraftRows(appliedFilterRows.length ? appliedFilterRows.map(r => ({ ...r })) : [defaultFilterRow()])
        }
      }}
      content={
        <div className="wt-my-tasks__filter-panel" onClick={e => e.stopPropagation()}>
          <div className="wt-my-tasks__filter-panel__head">
            <Typography.Text strong>设置筛选条件</Typography.Text>
            <Button type="text" size="small" icon={<CloseOutlined />} aria-label="关闭" onClick={() => setFilterPopoverOpen(false)} />
          </div>
          <div className="wt-my-tasks__filter-panel__rows">
            {filterDraftRows.map(row => (
              <div key={row.id} className="wt-my-tasks__filter-panel__row">
                <span className="wt-my-tasks__filter-panel__when">当</span>
                <Select<MyTaskFilterField> size="small" style={{ width: 120 }} value={row.field} options={FILTER_FIELD_OPTIONS} onChange={v => updateFilterDraftRow(row.id, { field: v })} />
                <Select<MyTaskFilterOp> size="small" style={{ width: 100 }} value={row.op} options={opsForField(row.field)} onChange={v => updateFilterDraftRow(row.id, { op: v })} />
                {isDateFilterField(row.field) ? (
                  <DatePicker
                    size="small"
                    className="wt-my-tasks__filter-panel__date"
                    placeholder="选择日期"
                    style={{ minWidth: 160, flex: '1 1 160px' }}
                    format="YYYY-MM-DD"
                    value={row.value ? dayjs(row.value, 'YYYY-MM-DD', true) : null}
                    onChange={d => updateFilterDraftRow(row.id, { value: d ? d.format('YYYY-MM-DD') : '' })}
                    allowClear
                    suffixIcon={<CalendarOutlined />}
                  />
                ) : row.field === 'status' && (row.op === 'eq' || row.op === 'neq') ? (
                  <Select size="small" allowClear placeholder="选择状态" style={{ minWidth: 160, flex: '1 1 160px' }} value={row.value || undefined} options={[...MY_TASK_STATUS_OPTIONS].map(v => ({ value: v, label: v }))} onChange={v => updateFilterDraftRow(row.id, { value: v ?? '' })} />
                ) : row.field === 'priority' && (row.op === 'eq' || row.op === 'neq') ? (
                  <Select size="small" allowClear placeholder="选择优先级" style={{ minWidth: 160, flex: '1 1 160px' }} value={row.value || undefined} options={[...MY_TASK_PRIORITY_OPTIONS].map(v => ({ value: v, label: v }))} onChange={v => updateFilterDraftRow(row.id, { value: v ?? '' })} />
                ) : row.field === 'owner' && (row.op === 'eq' || row.op === 'neq') ? (
                  <Select size="small" showSearch allowClear optionFilterProp="label" placeholder="从通讯录选择负责人" style={{ minWidth: 200, flex: '1 1 200px' }} value={row.value || undefined} options={contactSelectOptions} onChange={v => updateFilterDraftRow(row.id, { value: v ?? '' })} />
                ) : row.field === 'participant' && (row.op === 'eq' || row.op === 'neq') ? (
                  <Select size="small" showSearch allowClear optionFilterProp="label" placeholder="从通讯录选择参与人" style={{ minWidth: 200, flex: '1 1 200px' }} value={row.value || undefined} options={contactSelectOptions} onChange={v => updateFilterDraftRow(row.id, { value: v ?? '' })} />
                ) : row.field === 'typeLabel' && row.op === 'eq' && distinctTypeLabels.length > 0 ? (
                  <Select
                    size="small"
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    placeholder="选择类型"
                    style={{ minWidth: 160, flex: '1 1 160px' }}
                    value={row.value || undefined}
                    options={distinctTypeLabels.map(t => ({ value: t, label: t }))}
                    onChange={v => updateFilterDraftRow(row.id, { value: v ?? '' })}
                  />
                ) : row.field === 'projectTitle' && row.op === 'eq' && distinctProjectTitles.length > 0 ? (
                  <Select
                    size="small"
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    placeholder="选择所属项目"
                    style={{ minWidth: 160, flex: '1 1 160px' }}
                    value={row.value || undefined}
                    options={distinctProjectTitles.map(t => ({ value: t, label: t }))}
                    onChange={v => updateFilterDraftRow(row.id, { value: v ?? '' })}
                  />
                ) : (
                  <Input
                    size="small"
                    allowClear
                    placeholder={row.field === 'typeLabel' ? '输入类型' : row.field === 'projectTitle' ? '输入所属项目' : '输入关键字'}
                    style={{ minWidth: 160, flex: '1 1 160px' }}
                    value={row.value}
                    onChange={e => updateFilterDraftRow(row.id, { value: e.target.value })}
                  />
                )}
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label="删除条件"
                  onClick={() =>
                    setFilterDraftRows(prev => {
                      const next = prev.filter(r => r.id !== row.id)
                      return next.length ? next : [defaultFilterRow()]
                    })
                  }
                />
              </div>
            ))}
          </div>
          <Button type="link" size="small" className="wt-my-tasks__filter-panel__add" onClick={() => setFilterDraftRows(prev => [...prev, defaultFilterRow()])}>
            + 新增筛选条件
          </Button>
          <Divider style={{ margin: '12px 0' }} />
          <div className="wt-my-tasks__filter-panel__footer">
            <Button
              type="link"
              size="small"
              onClick={() => {
                setAppliedFilterRows([])
                setFilterDraftRows([defaultFilterRow()])
                setFilterPopoverOpen(false)
              }}
            >
              重置
            </Button>
            <Space>
              <Button size="small" onClick={() => setFilterPopoverOpen(false)}>
                取消
              </Button>
              <Button
                type="primary"
                size="small"
                onClick={() => {
                  const normalized = filterDraftRows.map(r => ({
                    ...r,
                    op: normalizeOpForField(r.field, r.op)
                  }))
                  setAppliedFilterRows(normalized.filter(r => r.value.trim() !== ''))
                  setFilterPopoverOpen(false)
                }}
              >
                确定
              </Button>
            </Space>
          </div>
        </div>
      }
    >
      <Button type="text" size="small" icon={<FilterOutlined />} className={`wt-my-tasks__filter-trigger${filterHasActiveRules ? ' wt-my-tasks__filter-trigger--active' : ''}`}>
        筛选
      </Button>
    </Popover>
  )

  const formatDateTime = (value?: string) => {
    if (!value) return '—'
    const d = dayjs(value)
    return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : value
  }

  const handleTableSortClick = (col: MyTasksTableSortColumn) => {
    setTableSort(prev => {
      if (prev.column !== col) return { column: col, order: 'asc' }
      if (prev.order === 'asc') return { column: col, order: 'desc' }
      return { column: null, order: 'asc' }
    })
  }

  const renderSortableTh = (label: string, col: MyTasksTableSortColumn, width: number) => {
    const active = tableSort.column === col
    const ascOn = active && tableSort.order === 'asc'
    const descOn = active && tableSort.order === 'desc'
    return (
      <th style={{ width }} className="wt-my-tasks__th--sortable" onClick={() => handleTableSortClick(col)}>
        <span className="wt-my-tasks__th__inner">
          {label}
          <span className="wt-my-tasks__th__sort-stack" aria-hidden>
            <CaretUpOutlined className={`wt-my-tasks__th__caret wt-my-tasks__th__caret--up${ascOn ? ' wt-my-tasks__th__caret--active' : ''}`} />
            <CaretDownOutlined className={`wt-my-tasks__th__caret wt-my-tasks__th__caret--down${descOn ? ' wt-my-tasks__th__caret--active' : ''}`} />
          </span>
        </span>
      </th>
    )
  }

  const renderTable = (cards: TaskCard[]) => {
    const sortedRows = sortTaskCardsForTable(cards, tableSort)
    const total = sortedRows.length
    const pagedRows = sortedRows.slice((tablePage - 1) * tablePageSize, tablePage * tablePageSize)
    return (
      <>
        <div className="wt-my-tasks__table-wrap">
          <table className="wt-my-tasks__table">
            <thead>
              <tr>
                <th className="wt-my-tasks__table-index">#</th>
                {renderSortableTh('编号', 'taskNumber', 220)}
                {renderSortableTh('标题', 'title', 220)}
                {renderSortableTh('类型', 'typeLabel', 120)}
                {renderSortableTh('状态', 'status', 140)}
                {renderSortableTh('负责人', 'owner', 180)}
                {renderSortableTh('所属项目', 'projectTitle', 180)}
                {renderSortableTh('优先级', 'priority', 120)}
                {renderSortableTh('创建时间', 'createdAt', 180)}
                {renderSortableTh('完成时间', 'completedAt', 180)}
                {renderSortableTh('开始时间', 'start', 120)}
                {renderSortableTh('截止时间', 'end', 120)}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((card, index) => (
                <tr key={card.id} tabIndex={0} onClick={() => openItemDetail(card)}>
                  <td className="wt-my-tasks__table-index">{(tablePage - 1) * tablePageSize + index + 1}</td>
                  <td className="wt-my-tasks__table-number">{card.taskNumber}</td>
                  <td>
                    <div className="wt-my-tasks__table-title">{card.title}</div>
                  </td>
                  <td>{card.typeLabel}</td>
                  <td>
                    <UnifiedWorkflowStatusTag status={card.status} />
                  </td>
                  <td>
                    <Space size={8}>
                      <Avatar size={22} className={UNIFIED_OWNER_AVATAR_CLASS}>
                        {unifiedOwnerAvatarInitials(card.owner)}
                      </Avatar>
                      <span>{card.owner}</span>
                    </Space>
                  </td>
                  <td>{card.projectTitle ? card.projectTitle : card.type === '目标' ? '项目目标' : '—'}</td>
                  <td>
                    <span className="wt-my-tasks__priority-pill">{card.priority?.trim() ? card.priority : '—'}</span>
                  </td>
                  <td>{formatDateTime(card.createdAt)}</td>
                  <td>{formatDateTime(card.completedAt)}</td>
                  <td>{card.start ? formatDetailDate(card.start) : '—'}</td>
                  <td>{card.overdue ? formatDetailDate(card.overdue) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wt-my-tasks__table-pagination">
          <Pagination
            size="small"
            current={tablePage}
            pageSize={tablePageSize}
            total={total}
            showSizeChanger
            showQuickJumper
            pageSizeOptions={[10, 20, 50]}
            onChange={(page, size) => {
              setTablePage(page)
              if (size !== tablePageSize) setTablePageSize(size)
            }}
            showTotal={(t, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${t} 条`}
          />
        </div>
      </>
    )
  }

  if (activeTab !== '我负责的') {
    return (
      <div className="wt-my-tasks">
        <div className="wt-my-tasks__toolbar">
          <div className="wt-my-tasks__toolbar-main">
            <Input
              className="wt-target-page__search wt-my-tasks__search"
              value={searchDraft}
              onChange={e => setSearchDraft(e.target.value)}
              onPressEnter={() => setSearchQuery(searchDraft.trim())}
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="按任务标题搜索，按 Enter 生效"
              variant="borderless"
              style={{ flex: '1 1 200px', maxWidth: 360, minWidth: 160 }}
            />
            <Divider type="vertical" style={{ height: 18, margin: 0, borderColor: 'rgba(0, 0, 0, 0.12)' }} />
            <Space size={12} wrap align="center">
              {renderMyTasksFilterControl()}
              <Typography.Text type="secondary">{tasksLoading ? '加载中…' : `${visibleActiveCards.length} 个任务`}</Typography.Text>
              <Typography.Text type="secondary">当前分组：{activeTab}</Typography.Text>
            </Space>
          </div>
          <div className="wt-my-tasks__toolbar-right">
            <Space size={8} align="center">
              <Typography.Text type="secondary">显示已完成</Typography.Text>
              <Switch size="small" checked={showCompleted} onChange={setShowCompleted} disabled={tasksLoading} />
            </Space>
          </div>
        </div>
        {tasksLoading ? <MyTasksTableBodySkeleton /> : renderTable(visibleActiveCards)}
      </div>
    )
  }

  return (
    <div className="wt-my-tasks">
      <div className="wt-my-tasks__toolbar">
        <div className="wt-my-tasks__toolbar-main">
          <Input
            className="wt-target-page__search wt-my-tasks__search"
            value={searchDraft}
            onChange={e => setSearchDraft(e.target.value)}
            onPressEnter={() => setSearchQuery(searchDraft.trim())}
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="按任务标题搜索，按 Enter 生效"
            variant="borderless"
            style={{ flex: '1 1 200px', maxWidth: 360, minWidth: 160 }}
          />
          <Divider type="vertical" style={{ height: 18, margin: 0, borderColor: 'rgba(0, 0, 0, 0.12)' }} />
          <Space size={12} wrap align="center">
            {renderMyTasksFilterControl()}
            <Dropdown
              menu={{
                items: [
                  { key: 'board', label: '看板视图', icon: <AppstoreOutlined /> },
                  { key: 'table', label: '表格视图', icon: <TableOutlined /> }
                ],
                selectable: true,
                selectedKeys: [responsibleViewMode],
                onClick: ({ key }) => setResponsibleViewModePersist(key as ResponsibleViewMode)
              }}
              trigger={['click']}
            >
              <Button type="text" size="small" style={{ color: 'rgba(0,0,0,0.45)', paddingInline: 8 }}>
                {responsibleViewMode === 'board' ? '看板视图' : '表格视图'}
                <DownOutlined style={{ marginLeft: 4, fontSize: 10 }} />
              </Button>
            </Dropdown>
            <Typography.Text type="secondary">{tasksLoading ? '加载中…' : `${totalVisible} 个任务`}</Typography.Text>
          </Space>
        </div>
        {responsibleViewMode === 'table' ? (
          <div className="wt-my-tasks__toolbar-right">
            <Space size={8} align="center">
              <Typography.Text type="secondary">显示已完成</Typography.Text>
              <Switch size="small" checked={showCompleted} onChange={setShowCompleted} disabled={tasksLoading} />
            </Space>
          </div>
        ) : null}
      </div>

      {tasksLoading ? (
        responsibleViewMode === 'table' ? (
          <MyTasksTableBodySkeleton />
        ) : (
          <MyTasksBoardBodySkeleton />
        )
      ) : responsibleViewMode === 'table' ? (
        renderTable(responsibleTableRows)
      ) : (
        <div className="wt-my-tasks__board">
          {COLUMN_META.map(column => {
            const columnIds = columnCardIds[column.key]
            const visibleIds = columnIds.filter(id => boardVisibleCardIds.has(id))
            const addCol: AddColumnKey | null = column.key === 'today' || column.key === 'next' || column.key === 'later' ? column.key : null
            return (
              <div
                className={dropColumnKey === column.key ? 'wt-my-tasks__column wt-my-tasks__column--drop' : 'wt-my-tasks__column'}
                key={column.key}
                onDragOver={e => {
                  e.preventDefault()
                  setDropColumnKey(column.key)
                  if (draggingCardId && columnIds.length === 0) {
                    syncDropInsert({ columnKey: column.key, beforeId: null })
                  }
                }}
                onDragLeave={() => setDropColumnKey(prev => (prev === column.key ? null : prev))}
                onDrop={e => {
                  e.preventDefault()
                  handleDropToColumn(column.key)
                }}
              >
                <div className="wt-my-tasks__column-header">
                  <Typography.Text>{column.title}</Typography.Text>
                  <Typography.Text type="secondary">0%</Typography.Text>
                </div>

                <div className="wt-my-tasks__column-progress">
                  <Progress percent={0} size="small" showInfo={false} strokeColor="#91caff" />
                </div>

                <div className="wt-my-tasks__column-body">
                  <div
                    className="wt-my-tasks__card-list"
                    onDragOver={e => {
                      if (draggingCardId) e.preventDefault()
                    }}
                    onDrop={e => {
                      if (e.target === e.currentTarget) {
                        e.preventDefault()
                        handleDropToColumn(column.key)
                      }
                    }}
                  >
                    {visibleIds.map(taskId => {
                      const task = cardsById[taskId]
                      if (!task) return null
                      const showDropBefore = dropInsert?.columnKey === column.key && dropInsert.beforeId === task.id
                      return (
                        <div className={showDropBefore ? 'wt-my-tasks__card-shell wt-my-tasks__card-shell--drop-before' : 'wt-my-tasks__card-shell'} key={task.id} onDragOver={e => handleCardDragOver(e, column.key, task.id, visibleIds)} onDrop={e => handleCardDrop(e, column.key)}>
                          <div
                            className="wt-my-tasks__card"
                            role="button"
                            tabIndex={0}
                            draggable
                            onDragStart={e => {
                              setDraggingCardId(task.id)
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', task.id)
                            }}
                            onDragEnd={() => {
                              setDraggingCardId(null)
                              setDropColumnKey(null)
                              syncDropInsert(null)
                            }}
                            onClick={() => openItemDetail(task)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                openItemDetail(task)
                              }
                            }}
                          >
                            <div className="wt-my-tasks__card-head">
                              <div className="wt-my-tasks__card-title">{task.title}</div>
                              <Dropdown
                                trigger={['click']}
                                menu={{
                                  items: [
                                    { key: 'open', label: '查看详情' },
                                    { key: 'project', label: '进入所属项目' },
                                    { key: 'delete', label: '删除任务', danger: true }
                                  ],
                                  onClick: ({ key, domEvent }) => {
                                    domEvent.stopPropagation()
                                    if (key === 'open') openItemDetail(task)
                                    if (key === 'project') {
                                      message.info('请从左侧「全部项目」打开对应项目')
                                    }
                                    if (key === 'delete') deleteTaskCard(task)
                                  }
                                }}
                              >
                                <Button type="text" size="small" className="wt-my-tasks__card-more" icon={<MoreOutlined />} onClick={e => e.stopPropagation()} />
                              </Dropdown>
                            </div>

                            <div className="wt-my-tasks__card-status-row">
                              <UnifiedWorkflowStatusTag status={task.status} />
                              <Avatar size={22} className={UNIFIED_OWNER_AVATAR_CLASS}>
                                {unifiedOwnerAvatarInitials(task.owner)}
                              </Avatar>
                            </div>

                            <div className="wt-my-tasks__card-pills-row">
                              <span className="wt-my-tasks__pill" title={task.taskNumber}>
                                任务编号: {formatTaskItemIdForDisplay(task.taskNumber)}
                              </span>
                              {task.start ? <span className="wt-my-tasks__pill">开始时间: {formatDetailDate(task.start)}</span> : <span className="wt-my-tasks__pill wt-my-tasks__pill--muted">开始时间: —</span>}
                            </div>
                            <div className="wt-my-tasks__card-pills-row wt-my-tasks__card-pills-row--second">
                              {task.overdue ? <span className="wt-my-tasks__pill wt-my-tasks__pill--deadline">截止时间: {formatDetailDate(task.overdue)}</span> : <span className="wt-my-tasks__pill wt-my-tasks__pill--muted">截止时间: —</span>}
                            </div>
                            <span className="wt-my-tasks__pill wt-my-tasks__pill--block">所属项目: {task.projectTitle}</span>
                            <span className="wt-my-tasks__pill wt-my-tasks__pill--block">任务类型: {task.typeLabel}</span>
                          </div>
                        </div>
                      )
                    })}
                    {visibleIds.length === 0 ? <div className="wt-my-tasks__column-empty">拖拽任务到这里</div> : null}
                  </div>

                  {addCol ? (
                    <Button
                      type="link"
                      className="wt-my-tasks__add-trigger"
                      icon={inlineAddColumn === addCol ? undefined : <PlusOutlined />}
                      onClick={() => toggleInlineAdd(addCol)}
                    >
                      {inlineAddColumn === addCol ? '收起' : '添加新任务'}
                    </Button>
                  ) : null}

                  {addCol && inlineAddColumn === addCol ? (
                    <div className="wt-my-tasks__inline-add">
                      <Input.TextArea className="wt-my-tasks__inline-add-text" placeholder="输入任务标题或描述" value={inlineAddDraft.title} onChange={e => setInlineAddDraft(d => ({ ...d, title: e.target.value }))} rows={3} autoFocus />
                      <div className="wt-my-tasks__inline-add-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'nowrap' }}>
                        <div className="wt-my-tasks__inline-add-type" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <StarFilled className="wt-my-tasks__inline-add-star" />
                          <Select size="small" variant="borderless" className="wt-my-tasks__inline-add-type-select" popupMatchSelectWidth={false} value={inlineAddDraft.bizType} options={personalBizTypeOptions()} onChange={v => setInlineAddDraft(d => ({ ...d, bizType: v as AddBizType }))} />
                        </div>
                        <div className="wt-my-tasks__inline-add-right" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <DatePicker size="small" format="YYYY-MM-DD" className="wt-my-tasks__inline-add-picker" placeholder="截止时间" value={inlineAddDraft.dueAt} onChange={d => setInlineAddDraft(prev => ({ ...prev, dueAt: d }))} suffixIcon={<CalendarOutlined />} allowClear />
                        </div>
                      </div>
                      <div className="wt-my-tasks__inline-add-actions">
                        <Button type="primary" size="small" onClick={handleInlineAddConfirm}>
                          确定
                        </Button>
                        <Button type="text" size="small" onClick={closeInlineAdd}>
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
