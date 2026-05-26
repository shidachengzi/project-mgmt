import { AppstoreOutlined, CalendarOutlined, CameraOutlined, CaretDownOutlined, CaretUpOutlined, CloseOutlined, DeleteOutlined, DownOutlined, FilterOutlined, MoreOutlined, PlusOutlined, SearchOutlined, TableOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Card, Col, DatePicker, Divider, Dropdown, Form, Input, Modal, Pagination, Popover, Row, Select, Space, Typography, message } from 'antd'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import dayjs from 'dayjs'
import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { useOrgStore } from '../../entities/org/model/useOrgStore'
import { useHasSystemPermission } from '../../entities/permission/systemPermissions'
import { getProjectMemberRoleMap } from '../../entities/permission/projectPermissions'
import { buildMappedProjectPermissionKey } from '../../entities/permission/projectPermissionMap'
import { isBackendAuthEnabled, resolveBackendUrl } from '../../shared/api/backendClient'
import { sessionAwareFetch } from '../../shared/api/sessionAwareFetch'
import { patchProject } from '../../shared/api/projectsApi'
import { patchProjectWorkspace } from '../../shared/api/projectWorkspaceApi'
import { useAccountStore } from '../../entities/account/model/useAccountStore'
import { useBackendDataStore } from '../../entities/workspace/model/backendDataStore'
import { defaultProjectTemplateId, projectTemplateConfigs, type ProjectTemplateId } from '../../entities/project/config/projectTemplates'
import type { ProjectSummary } from '../../entities/project/model/types'
import { UNIFIED_OWNER_AVATAR_CLASS, UnifiedWorkflowStatusTag, unifiedOwnerAvatarInitials } from '../../shared/ui/unifiedWorkflowStatusTag'

export type { ProjectSummary }

/** 项目列表由后端同步；此处仅保留类型导出兼容 */
export const projects: ProjectSummary[] = []

type AllProjectsPageProps = {
  projects: ProjectSummary[]
  onOpenProject?: (project: ProjectSummary) => void
  onOpenProjectSettings?: (project: ProjectSummary) => void
  onCreateProject?: (project: ProjectSummary) => void
  onUpdateProject?: (project: ProjectSummary) => void
}

type ProjectInfoMeta = {
  owner: string
  startDate: string
  endDate: string
  description: string
  progressStatus: '未开始' | '进行中' | '验收中' | '已完成' | '关闭'
  healthStatus: '正常' | '有风险' | '失控'
  statusDescription: string
  visibility: '公开（企业所有成员）' | '私有（仅加入的项目成员）'
  createdAt: string
  updatedAt: string
}

const DEFAULT_PROJECT_INFO_META: ProjectInfoMeta = {
  owner: '',
  startDate: dayjs().format('YYYY-MM-DD'),
  endDate: dayjs().format('YYYY-MM-DD'),
  description: '',
  progressStatus: '未开始',
  healthStatus: '正常',
  statusDescription: '',
  visibility: '公开（企业所有成员）',
  createdAt: dayjs().toISOString(),
  updatedAt: dayjs().toISOString()
}

const normalizeProjectInfoMeta = (meta?: Partial<ProjectInfoMeta> | null): ProjectInfoMeta => ({
  ...DEFAULT_PROJECT_INFO_META,
  ...meta,
  createdAt: meta?.createdAt ?? DEFAULT_PROJECT_INFO_META.createdAt,
  updatedAt: meta?.updatedAt ?? meta?.createdAt ?? DEFAULT_PROJECT_INFO_META.updatedAt
})

function resolveProjectInfoMetaForListProject(
  project: ProjectSummary,
  workspaceLite?: { owner: string; startDate: string; endDate: string; progressStatus: string; healthStatus: string }
): ProjectInfoMeta {
  const visibility: ProjectInfoMeta['visibility'] =
    project.backendVisibility === 'public'
      ? '公开（企业所有成员）'
      : project.backendVisibility === 'private'
        ? '私有（仅加入的项目成员）'
        : DEFAULT_PROJECT_INFO_META.visibility
  return normalizeProjectInfoMeta({
    owner: workspaceLite?.owner ?? '',
    startDate: workspaceLite?.startDate || DEFAULT_PROJECT_INFO_META.startDate,
    endDate: workspaceLite?.endDate || DEFAULT_PROJECT_INFO_META.endDate,
    description: '无',
    progressStatus: (project.backendProgressStatus ?? workspaceLite?.progressStatus ?? '进行中') as ProjectInfoMeta['progressStatus'],
    healthStatus: (workspaceLite?.healthStatus || '正常') as ProjectInfoMeta['healthStatus'],
    statusDescription: '无',
    visibility,
    createdAt: project.createdAt ?? DEFAULT_PROJECT_INFO_META.createdAt,
    updatedAt: project.updatedAt ?? dayjs().toISOString()
  })
}
type ProjectStatusFilter = 'doing' | 'todo' | 'acceptance' | 'done' | 'archived' | 'all'

type ProjectListViewMode = 'card' | 'table'

type ProjectRowSnapshot = {
  title: string
  progressStatus: string
  healthStatus: string
  visibility: string
  owner: string
  templateName: string
  startDate: string
  endDate: string
  /** 用于筛选/排序的创建日 YYYY-MM-DD */
  createdAt: string
  /** 表格展示用创建时间（含时分秒） */
  createdAtDisplay: string
  updatedAt: string
}

type AllProjectsTableSortColumn = 'title' | 'templateName' | 'progressStatus' | 'owner' | 'visibility' | 'startDate' | 'endDate' | 'createdAt'

type AllProjectFilterField = keyof ProjectRowSnapshot
type ProjectListFilterOp = 'eq' | 'neq' | 'contains' | 'before' | 'after'

type ProjectListFilterRow = {
  id: string
  field: AllProjectFilterField
  op: ProjectListFilterOp
  value: string
}

const ALL_PROJECT_FILTER_FIELD_OPTIONS: { value: AllProjectFilterField; label: string }[] = [
  { value: 'title', label: '项目名称' },
  { value: 'progressStatus', label: '项目状态' },
  { value: 'healthStatus', label: '健康度' },
  { value: 'visibility', label: '可见范围' },
  { value: 'owner', label: '负责人' },
  { value: 'templateName', label: '项目模板' },
  { value: 'startDate', label: '开始时间' },
  { value: 'endDate', label: '截止时间' },
  { value: 'createdAt', label: '创建时间' },
  { value: 'updatedAt', label: '更新时间' }
]

const PROJECT_LIST_PROGRESS_OPTIONS: ProjectInfoMeta['progressStatus'][] = ['未开始', '进行中', '验收中', '已完成', '关闭']
const PROJECT_LIST_HEALTH_OPTIONS: ProjectInfoMeta['healthStatus'][] = ['正常', '有风险', '失控']
const PROJECT_LIST_VISIBILITY_OPTIONS: ProjectInfoMeta['visibility'][] = ['公开（企业所有成员）', '私有（仅加入的项目成员）']

function newProjectListFilterRowId() {
  return `pfr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function defaultProjectListFilterRow(): ProjectListFilterRow {
  return { id: newProjectListFilterRowId(), field: 'title', op: 'contains', value: '' }
}

function isAllProjectDateFilterField(field: AllProjectFilterField): boolean {
  return field === 'startDate' || field === 'endDate' || field === 'createdAt' || field === 'updatedAt'
}

function opsForAllProjectField(field: AllProjectFilterField): { value: ProjectListFilterOp; label: string }[] {
  if (isAllProjectDateFilterField(field)) {
    return [
      { value: 'eq', label: '等于' },
      { value: 'neq', label: '不等于' },
      { value: 'before', label: '早于' },
      { value: 'after', label: '晚于' }
    ]
  }
  if (field === 'progressStatus' || field === 'healthStatus' || field === 'visibility') {
    return [
      { value: 'eq', label: '等于' },
      { value: 'neq', label: '不等于' }
    ]
  }
  return [
    { value: 'eq', label: '等于' },
    { value: 'neq', label: '不等于' },
    { value: 'contains', label: '包含' }
  ]
}

function normalizeAllProjectFilterOp(field: AllProjectFilterField, op: ProjectListFilterOp): ProjectListFilterOp {
  const allowed = opsForAllProjectField(field).map(o => o.value)
  return (allowed.includes(op) ? op : 'eq') as ProjectListFilterOp
}

function parseProjectSnapshotDay(snap: ProjectRowSnapshot, field: AllProjectFilterField): string | null {
  const raw = snap[field]
  if (typeof raw !== 'string' || !raw.trim()) return null
  const d = dayjs(raw.trim())
  if (!d.isValid()) return null
  return d.format('YYYY-MM-DD')
}

function allProjectFilterRowMatches(snap: ProjectRowSnapshot, row: ProjectListFilterRow): boolean {
  const v = row.value.trim()
  if (v === '') return true
  if (isAllProjectDateFilterField(row.field)) {
    const filterDay = dayjs(v, ['YYYY-MM-DD', 'YYYY/MM/DD'], true)
    if (!filterDay.isValid()) return true
    const cardDayStr = parseProjectSnapshotDay(snap, row.field)
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
  const raw = String(snap[row.field] ?? '')
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

function projectListMatchesAppliedFilters(snap: ProjectRowSnapshot, rows: ProjectListFilterRow[]): boolean {
  if (!rows.length) return true
  return rows.every(r => allProjectFilterRowMatches(snap, r))
}

function compareProjectRowsByColumn(a: { snap: ProjectRowSnapshot }, b: { snap: ProjectRowSnapshot }, col: AllProjectsTableSortColumn, order: 'asc' | 'desc'): number {
  const mul = order === 'asc' ? 1 : -1
  const sa = a.snap[col]
  const sb = b.snap[col]
  if (col === 'startDate' || col === 'endDate' || col === 'createdAt') {
    const da = dayjs(String(sa), 'YYYY-MM-DD', true).isValid() ? dayjs(String(sa), 'YYYY-MM-DD').valueOf() : 0
    const db = dayjs(String(sb), 'YYYY-MM-DD', true).isValid() ? dayjs(String(sb), 'YYYY-MM-DD').valueOf() : 0
    return (da - db) * mul
  }
  return String(sa || '').localeCompare(String(sb || ''), 'zh-CN') * mul
}

function sortProjectListRows(rows: Array<{ project: ProjectSummary; snap: ProjectRowSnapshot }>, sort: { column: AllProjectsTableSortColumn | null; order: 'asc' | 'desc' }): Array<{ project: ProjectSummary; snap: ProjectRowSnapshot }> {
  if (!sort.column) return [...rows]
  const copy = [...rows]
  copy.sort((x, y) => compareProjectRowsByColumn(x, y, sort.column!, sort.order))
  return copy
}

type BuildProjectSnapshotExtras = {
  workspaceLite?: {
    owner: string
    startDate: string
    endDate: string
    progressStatus: string
    healthStatus: string
  }
  ownerFromProjectMembers?: string
  ownerFromOrg?: string
}

function buildProjectListSnapshot(project: ProjectSummary, extras?: BuildProjectSnapshotExtras): ProjectRowSnapshot {
  let progressStatus = (extras?.workspaceLite?.progressStatus || '').trim() || (project.backendProgressStatus ?? '进行中').trim()
  const healthStatus = (extras?.workspaceLite?.healthStatus || '').trim() || '正常'
  let visibility = DEFAULT_PROJECT_INFO_META.visibility
  if (project.backendVisibility === 'public') visibility = '公开（企业所有成员）'
  else if (project.backendVisibility === 'private') visibility = '私有（仅加入的项目成员）'

  const owner = (extras?.workspaceLite?.owner || '').trim() || (extras?.ownerFromProjectMembers || '').trim() || (extras?.ownerFromOrg || '').trim()
  const templateName = projectTemplateConfigs.find(t => t.id === project.templateId)?.name ?? ''

  const startDate = (extras?.workspaceLite?.startDate || '').trim()
  const endDate = (extras?.workspaceLite?.endDate || '').trim()
  const rawCreated = (project.createdAt || '').trim()
  const dCreated = rawCreated ? dayjs(rawCreated) : null
  const createdAt = dCreated?.isValid() ? dCreated.format('YYYY-MM-DD') : project.createdAt ? dayjs(project.createdAt).format('YYYY-MM-DD') : ''
  const createdAtDisplay = dCreated?.isValid() ? dCreated.format('YYYY-MM-DD HH:mm:ss') : createdAt ? `${createdAt} 00:00:00` : ''
  const updatedAt = project.updatedAt ? dayjs(project.updatedAt).format('YYYY-MM-DD') : ''

  return {
    title: project.title,
    progressStatus,
    healthStatus,
    visibility,
    owner,
    templateName,
    startDate,
    endDate,
    createdAt,
    createdAtDisplay,
    updatedAt
  }
}

export function AllProjectsPage({ projects, onOpenProject, onOpenProjectSettings, onCreateProject, onUpdateProject }: AllProjectsPageProps) {
  const authedUserId = useAuthStore(s => s.authedUserId)
  const canCreatePublicProject = useHasSystemPermission('project.create_public')
  const canCreatePrivateProject = useHasSystemPermission('project.create_private')
  const canCreateProject = canCreatePublicProject || canCreatePrivateProject
  const memberRoleMaps = useBackendDataStore(s => s.memberRoleMapByProject)
  const workspaceOverviewLiteByProject = useBackendDataStore(s => s.workspaceOverviewLiteByProject)
  const membersRowsByProject = useBackendDataStore(s => s.membersRowsByProject)
  const orgMembers = useOrgStore(s => s.members)
  const currentUserDisplayName = useMemo(() => {
    if (authedUserId) {
      const fromOrg = orgMembers.find(m => m.id === authedUserId)?.name?.trim()
      if (fromOrg) return fromOrg
    }
    return useAccountStore.getState().profile.name?.trim() ?? ''
  }, [authedUserId, orgMembers])
  const contactSelectOptions = useMemo(() => {
    return orgMembers
      .filter(m => !m.disabled)
      .map(m => ({
        value: m.id,
        label: m.department ? `${m.name} · ${m.department}` : m.name
      }))
  }, [orgMembers])
  const [createOpen, setCreateOpen] = useState(false)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [projectInfoTarget, setProjectInfoTarget] = useState<ProjectSummary | null>(null)
  const [projectCoverHover, setProjectCoverHover] = useState(false)
  const [hoverProjectId, setHoverProjectId] = useState<string | null>(null)
  /** 默认「进行中」：与后端列表 progressStatus 对齐（工作区未写入时服务端视为进行中） */
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('doing')
  const [searchDraft, setSearchDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ProjectListViewMode>('card')
  const [tableSort, setTableSort] = useState<{ column: AllProjectsTableSortColumn | null; order: 'asc' | 'desc' }>({
    column: null,
    order: 'asc'
  })
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)
  const [filterDraftRows, setFilterDraftRows] = useState<ProjectListFilterRow[]>([defaultProjectListFilterRow()])
  const [appliedFilterRows, setAppliedFilterRows] = useState<ProjectListFilterRow[]>([])
  const [listPage, setListPage] = useState(1)
  const [listPageSize, setListPageSize] = useState(20)
  const coverUploadInputRef = useRef<HTMLInputElement | null>(null)
  const [createForm] = Form.useForm<{
    title: string
    templateId: ProjectTemplateId
    members: string[]
    visibility: ProjectInfoMeta['visibility']
    owner?: string
    startDate: dayjs.Dayjs | null
    endDate: dayjs.Dayjs | null
    description: string
  }>()
  const [projectInfoForm] = Form.useForm<{
    title: string
    templateId: ProjectTemplateId
    owner: string
    startDate: dayjs.Dayjs | null
    endDate: dayjs.Dayjs | null
    description: string
    progressStatus: ProjectInfoMeta['progressStatus']
    healthStatus: ProjectInfoMeta['healthStatus']
    statusDescription: string
    visibility: ProjectInfoMeta['visibility']
  }>()
  /** 多成员协作：定期刷新项目列表与概览摘要，避免他人修改后列表仍显示旧数据 */
  useEffect(() => {
    if (!isBackendAuthEnabled()) return
    const refresh = () => {
      if (projectInfoOpen) return
      void useBackendDataStore.getState().refreshProjectsList()
    }
    const intervalId = window.setInterval(refresh, 20_000)
    const onWake = () => refresh()
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [projectInfoOpen])

  const visibleProjects = useMemo(() => {
    return projects.filter(project => {
      if (project.backendVisibility === 'public') return true
      if (!authedUserId) return false
      if (project.backendVisibility === 'private') {
        const roleMap = memberRoleMaps[project.id] ?? getProjectMemberRoleMap(project.id)
        if (Object.keys(roleMap).length > 0) return Boolean(roleMap[authedUserId])
        return true
      }
      return true
    })
  }, [authedUserId, projects, memberRoleMaps])

  const isCurrentUserProjectMember = (projectId: string) => {
    if (!authedUserId) return false
    const roleMap = memberRoleMaps[projectId] ?? getProjectMemberRoleMap(projectId)
    return Boolean(roleMap[authedUserId])
  }

  const filteredProjects = useMemo(() => {
    const isArchived = (p: ProjectSummary) => Boolean(p.backendArchived)
    const getProjectProgressStatus = (p: ProjectSummary): ProjectInfoMeta['progressStatus'] | null => {
      const fromBackend = p.backendProgressStatus
      if (fromBackend) return fromBackend
      const lite = workspaceOverviewLiteByProject[p.id]?.progressStatus
      if (lite && (['未开始', '进行中', '验收中', '已完成', '关闭'] as const).includes(lite as ProjectInfoMeta['progressStatus'])) {
        return lite as ProjectInfoMeta['progressStatus']
      }
      return '进行中'
    }
    if (statusFilter === 'all') return visibleProjects
    if (statusFilter === 'archived') return visibleProjects.filter(p => isArchived(p))
    if (statusFilter === 'todo') {
      return visibleProjects.filter(p => getProjectProgressStatus(p) === '未开始' && !isArchived(p))
    }
    if (statusFilter === 'acceptance') {
      return visibleProjects.filter(p => getProjectProgressStatus(p) === '验收中' && !isArchived(p))
    }
    if (statusFilter === 'done') {
      return visibleProjects.filter(p => {
        const status = getProjectProgressStatus(p)
        return (status === '已完成' || status === '关闭') && !isArchived(p)
      })
    }
    return visibleProjects.filter(p => getProjectProgressStatus(p) === '进行中' && !isArchived(p))
  }, [statusFilter, visibleProjects, workspaceOverviewLiteByProject])

  const listRowsWithSnap = useMemo(() => {
    return filteredProjects.map(project => {
      const lite = workspaceOverviewLiteByProject[project.id]
      const uid = project.backendOwnerUserId
      let ownerFromProjectMembers = ''
      let ownerFromOrg = ''
      if (uid) {
        ownerFromProjectMembers = (membersRowsByProject[project.id] ?? []).find(m => m.userId === uid)?.name ?? ''
        ownerFromOrg = orgMembers.find(m => m.id === uid)?.name ?? ''
      }
      return {
        project,
        snap: buildProjectListSnapshot(project, {
          workspaceLite: lite,
          ownerFromProjectMembers: ownerFromProjectMembers || undefined,
          ownerFromOrg: ownerFromOrg || undefined
        })
      }
    })
  }, [filteredProjects, workspaceOverviewLiteByProject, membersRowsByProject, orgMembers])

  const searchedAndFilteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return listRowsWithSnap.filter(({ project, snap }) => {
      if (q && !project.title.toLowerCase().includes(q)) return false
      return projectListMatchesAppliedFilters(snap, appliedFilterRows)
    })
  }, [listRowsWithSnap, searchQuery, appliedFilterRows])

  const orderedRows = useMemo(() => {
    if (viewMode !== 'table' || !tableSort.column) return [...searchedAndFilteredRows]
    return sortProjectListRows(searchedAndFilteredRows, tableSort)
  }, [searchedAndFilteredRows, viewMode, tableSort])

  const displayTotal = orderedRows.length

  const pagedRows = useMemo(() => {
    const start = (listPage - 1) * listPageSize
    return orderedRows.slice(start, start + listPageSize)
  }, [orderedRows, listPage, listPageSize])

  useEffect(() => {
    setListPage(1)
  }, [searchQuery, appliedFilterRows, statusFilter, viewMode, listPageSize, tableSort.column, tableSort.order])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(displayTotal / listPageSize) || 1)
    setListPage(p => (p > maxPage ? maxPage : p))
  }, [displayTotal, listPageSize])

  const distinctTemplateNames = useMemo(() => {
    const s = new Set<string>()
    listRowsWithSnap.forEach(({ snap }) => {
      if (snap.templateName.trim()) s.add(snap.templateName)
    })
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [listRowsWithSnap])

  const totalCount = displayTotal

  const projectInfoDrawerMeta = useMemo(() => {
    if (!projectInfoTarget) return null
    return resolveProjectInfoMetaForListProject(projectInfoTarget, workspaceOverviewLiteByProject[projectInfoTarget.id])
  }, [projectInfoTarget, workspaceOverviewLiteByProject])

  const projectInfoPublicReadonly =
    Boolean(projectInfoDrawerMeta) &&
    projectInfoDrawerMeta!.visibility === '公开（企业所有成员）' &&
    Boolean(projectInfoTarget) &&
    !isCurrentUserProjectMember(projectInfoTarget!.id)

  const templateOptions = useMemo(() => projectTemplateConfigs.map(item => ({ label: item.name, value: item.id })), [])

  const handleCloseCreate = () => {
    setCreateOpen(false)
    createForm.resetFields()
  }

  const handleOpenCreate = () => {
    if (!canCreateProject) {
      message.warning('暂无新建项目权限')
      return
    }
    if (orgMembers.length > 0) {
      const selfInOrg = Boolean(authedUserId && orgMembers.some(m => m.id === authedUserId))
      createForm.setFieldsValue({
        title: '',
        templateId: defaultProjectTemplateId,
        members: selfInOrg && authedUserId ? [authedUserId] : [],
        visibility: '公开（企业所有成员）',
        owner: selfInOrg && authedUserId ? authedUserId : undefined,
        startDate: null,
        endDate: null,
        description: ''
      })
    } else {
      createForm.setFieldsValue({
        title: '',
        templateId: defaultProjectTemplateId,
        members: [],
        visibility: '公开（企业所有成员）',
        owner: undefined,
        startDate: null,
        endDate: null,
        description: ''
      })
    }
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      const isPublicProject = values.visibility === '公开（企业所有成员）'
      if (isPublicProject && !canCreatePublicProject) {
        message.warning('暂无新建公开项目权限')
        return
      }
      if (!isPublicProject && !canCreatePrivateProject) {
        message.warning('暂无新建私有项目权限')
        return
      }
      const url = resolveBackendUrl('/api/projects')
      if (!url) {
        message.error('未配置后端地址')
        return
      }
      if (values.startDate && values.endDate && values.endDate.isBefore(values.startDate, 'day')) {
        message.error('截止时间不能早于开始时间')
        return
      }
      const vis = isPublicProject ? 'public' : 'private'

      const ownerUserIdPre = values.owner ?? authedUserId ?? undefined
      const startD = values.startDate ?? dayjs()
      const endD = values.endDate ?? dayjs().add(1, 'month')
      const startIso = startD.format('YYYY-MM-DD')
      const endIso = endD.format('YYYY-MM-DD')
      const startZh = startD.format('M月D日')
      const endZh = endD.format('M月D日')
      const ownerDisplayName = (ownerUserIdPre && orgMembers.find(m => m.id === ownerUserIdPre)?.name) || currentUserDisplayName || '—'
      const templateName = projectTemplateConfigs.find(item => item.id === values.templateId)?.name ?? '项目管理'
      const desc = values.description?.trim() ? values.description.trim() : '无'

      const res = await sessionAwareFetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: values.title.trim(),
          visibility: vis,
          initialWorkspace: {
            owner: ownerDisplayName,
            startDate: startIso,
            endDate: endIso,
            description: desc,
            visibilityLabel: values.visibility,
            createActivity: {
              actor: currentUserDisplayName || ownerDisplayName,
              before: templateName,
              after: `从项目模板创建项目（负责人：${ownerDisplayName}，开始：${startZh}，截止：${endZh}，状态：未开始，健康度：正常）`
            }
          }
        })
      })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: { id?: string }; error?: { message?: string } } | null
      if (!res.ok || !json?.ok || !json.data?.id) {
        message.error(json?.error?.message || '创建项目失败')
        return
      }
      const id = json.data.id
      const created: ProjectSummary = {
        id,
        title: values.title.trim(),
        cover: 'gradient',
        templateId: values.templateId,
        isPreset: false,
        backendVisibility: vis,
        backendArchived: false,
        backendProgressStatus: '未开始'
      }
      onCreateProject?.(created)

      const addMember = useBackendDataStore.getState().addProjectMember
      const selectedIds = values.members ?? []
      for (const uid of selectedIds) {
        if (!uid || uid === authedUserId) continue
        await addMember(id, uid, 'normal')
      }
      if (ownerUserIdPre && ownerUserIdPre !== authedUserId) {
        const pr = await patchProject(id, { ownerUserId: ownerUserIdPre })
        if (!pr.ok) message.warning(pr.message)
      }

      const nowIso = new Date().toISOString()
      const wsRes = await patchProjectWorkspace(id, {
        overview: {
          title: values.title.trim(),
          owner: ownerDisplayName,
          startDate: startIso,
          endDate: endIso,
          description: desc,
          progressStatus: '未开始',
          healthStatus: '正常',
          statusDescription: '无',
          visibility: values.visibility
        },
        overviewActivities: [
          {
            id: `po-create-${id}-${Date.now()}`,
            actor: currentUserDisplayName || ownerDisplayName,
            targetTitle: values.title.trim(),
            fieldLabel: '创建项目',
            before: templateName,
            after: `从项目模板创建项目（负责人：${ownerDisplayName}，开始：${startZh}，截止：${endZh}，状态：未开始，健康度：正常）`,
            createdAt: nowIso
          }
        ]
      })
      if (!wsRes.ok) message.warning(wsRes.message || '项目已创建，但概览信息同步失败，可在项目内补全')

      await useBackendDataStore.getState().bootstrap()
      onOpenProject?.(created)
      handleCloseCreate()
      message.success('项目已创建')
    } catch {
      // ignore validation errors
    }
  }

  const handleOpenProjectInfo = (project: ProjectSummary) => {
    const meta = resolveProjectInfoMetaForListProject(project, workspaceOverviewLiteByProject[project.id])
    setProjectInfoTarget(project)
    projectInfoForm.setFieldsValue({
      title: project.title,
      templateId: project.templateId,
      owner: meta.owner,
      startDate: dayjs(meta.startDate),
      endDate: dayjs(meta.endDate),
      description: meta.description,
      progressStatus: meta.progressStatus,
      healthStatus: meta.healthStatus,
      statusDescription: meta.statusDescription,
      visibility: meta.visibility
    })
    setProjectInfoOpen(true)
  }

  const handleSaveProjectInfo = async () => {
    if (!projectInfoTarget) return
    try {
      const values = await projectInfoForm.validateFields()
      const currentMeta = resolveProjectInfoMetaForListProject(projectInfoTarget, workspaceOverviewLiteByProject[projectInfoTarget.id])
      if (currentMeta.visibility === '公开（企业所有成员）' && !isCurrentUserProjectMember(projectInfoTarget.id)) {
        message.warning('公开项目仅成员可编辑，您不在该项目成员中')
        return
      }
      if (values.startDate && values.endDate && values.endDate.isBefore(values.startDate, 'day')) {
        message.error('截止时间不能早于开始时间')
        return
      }

      const vis = values.visibility === '公开（企业所有成员）' ? 'public' : 'private'
      const ownerDisplay = values.owner.trim()
      const startIso = values.startDate ? values.startDate.format('YYYY-MM-DD') : DEFAULT_PROJECT_INFO_META.startDate
      const endIso = values.endDate ? values.endDate.format('YYYY-MM-DD') : DEFAULT_PROJECT_INFO_META.endDate
      const pr = await patchProject(projectInfoTarget.id, { title: values.title.trim(), visibility: vis })
      if (!pr.ok) {
        message.error(pr.message)
        return
      }
      const wsRes = await patchProjectWorkspace(projectInfoTarget.id, {
        overview: {
          title: values.title.trim(),
          owner: ownerDisplay,
          startDate: startIso,
          endDate: endIso,
          description: values.description.trim() || '无',
          progressStatus: values.progressStatus,
          healthStatus: values.healthStatus,
          statusDescription: values.statusDescription.trim() || '无',
          visibility: values.visibility
        }
      })
      if (!wsRes.ok) message.warning(wsRes.message || '项目已更新，但概览同步失败')
      await useBackendDataStore.getState().refreshProject(projectInfoTarget.id)
      const nextProject: ProjectSummary = {
        ...projectInfoTarget,
        title: pr.data.title,
        templateId: values.templateId,
        backendVisibility: pr.data.visibility === 'public' ? 'public' : 'private',
        backendProgressStatus: values.progressStatus,
        backendArchived: pr.data.archived,
        createdAt: pr.data.createdAt,
        updatedAt: pr.data.updatedAt
      }
      onUpdateProject?.(nextProject)
      setProjectInfoTarget(nextProject)
      setProjectInfoOpen(false)
      message.success('项目信息已更新')
    } catch {
      // ignore validation errors
    }
  }

  const handleUploadProjectCover = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!projectInfoTarget) return
    const currentMeta = resolveProjectInfoMetaForListProject(projectInfoTarget, workspaceOverviewLiteByProject[projectInfoTarget.id])
    if (currentMeta.visibility === '公开（企业所有成员）' && !isCurrentUserProjectMember(projectInfoTarget.id)) {
      message.warning('公开项目仅成员可上传封面')
      event.target.value = ''
      return
    }
    const perms = useBackendDataStore.getState().myProjectPermissionKeys[projectInfoTarget.id]
    const pk = buildMappedProjectPermissionKey('项目权限', '基本设置')
    if (!perms?.includes(pk)) {
      message.warning('当前角色暂无「基本设置」权限')
      event.target.value = ''
      return
    }
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      message.error('请上传图片文件')
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      if (!dataUrl) {
        message.error('封面读取失败，请重试')
        return
      }
      const targetId = projectInfoTarget.id
      void (async () => {
        const res = await patchProject(targetId, { coverKind: 'image', coverImageData: dataUrl })
        if (!res.ok) {
          message.error(res.message)
          return
        }
        const d = res.data
        const nextProject: ProjectSummary = {
          ...projectInfoTarget,
          cover: 'image',
          image: d.coverImageData ?? dataUrl
        }
        onUpdateProject?.(nextProject)
        setProjectInfoTarget(nextProject)
        message.success('封面已更新')
      })()
    }
    reader.onerror = () => message.error('封面读取失败，请重试')
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const filterHasActiveRules = appliedFilterRows.some(r => r.value.trim() !== '')

  const updateProjectListFilterDraftRow = (rowId: string, patch: Partial<ProjectListFilterRow>) => {
    setFilterDraftRows(prev =>
      prev.map(r => {
        if (r.id !== rowId) return r
        const next = { ...r, ...patch }
        if (patch.field != null) {
          next.op = normalizeAllProjectFilterOp(patch.field, next.op)
          if (patch.field !== r.field) next.value = ''
        }
        return next
      })
    )
  }

  const formatListCellDate = (ymd: string) => (ymd && dayjs(ymd, 'YYYY-MM-DD', true).isValid() ? dayjs(ymd, 'YYYY-MM-DD').format('YYYY-MM-DD') : '—')

  const handleTableSortClick = (col: AllProjectsTableSortColumn) => {
    setTableSort(prev => {
      if (prev.column !== col) return { column: col, order: 'asc' }
      if (prev.order === 'asc') return { column: col, order: 'desc' }
      return { column: null, order: 'asc' }
    })
  }

  const renderSortableTh = (label: string, col: AllProjectsTableSortColumn, thStyle?: CSSProperties) => {
    const active = tableSort.column === col
    const ascOn = active && tableSort.order === 'asc'
    const descOn = active && tableSort.order === 'desc'
    return (
      <th style={thStyle} className="wt-my-tasks__th--sortable wt-all-projects__th" onClick={() => handleTableSortClick(col)}>
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

  const renderOwnerTableCell = (ownerName: string, _ownerUserId?: string | null) => {
    const name = ownerName?.trim() || ''
    if (!name) {
      return (
        <Space size={8} className="wt-all-projects__owner-cell">
          <Avatar size={22} icon={<UserOutlined />} className={`${UNIFIED_OWNER_AVATAR_CLASS} wt-reports-detail__owner-avatar--empty`} />
          <span className="wt-all-projects__td-muted">—</span>
        </Space>
      )
    }
    return (
      <Space size={8} className="wt-all-projects__owner-cell">
        <Avatar size={22} className={UNIFIED_OWNER_AVATAR_CLASS}>
          {unifiedOwnerAvatarInitials(name)}
        </Avatar>
        <span className="wt-all-projects__owner-name">{name}</span>
      </Space>
    )
  }

  const renderAllProjectsFilterControl = () => (
    <Popover
      trigger="click"
      placement="bottomLeft"
      overlayStyle={{ maxWidth: 640 }}
      open={filterPopoverOpen}
      onOpenChange={open => {
        setFilterPopoverOpen(open)
        if (open) {
          setFilterDraftRows(appliedFilterRows.length ? appliedFilterRows.map(r => ({ ...r })) : [defaultProjectListFilterRow()])
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
                <Select<AllProjectFilterField> size="small" style={{ width: 120 }} value={row.field} options={ALL_PROJECT_FILTER_FIELD_OPTIONS} onChange={v => updateProjectListFilterDraftRow(row.id, { field: v })} />
                <Select<ProjectListFilterOp> size="small" style={{ width: 100 }} value={row.op} options={opsForAllProjectField(row.field)} onChange={v => updateProjectListFilterDraftRow(row.id, { op: v })} />
                {isAllProjectDateFilterField(row.field) ? (
                  <DatePicker
                    size="small"
                    className="wt-my-tasks__filter-panel__date"
                    placeholder="选择日期"
                    style={{ minWidth: 160, flex: '1 1 160px' }}
                    format="YYYY-MM-DD"
                    value={row.value ? dayjs(row.value, 'YYYY-MM-DD', true) : null}
                    onChange={d => updateProjectListFilterDraftRow(row.id, { value: d ? d.format('YYYY-MM-DD') : '' })}
                    allowClear
                    suffixIcon={<CalendarOutlined />}
                  />
                ) : row.field === 'progressStatus' && (row.op === 'eq' || row.op === 'neq') ? (
                  <Select
                    size="small"
                    allowClear
                    placeholder="选择状态"
                    style={{ minWidth: 160, flex: '1 1 160px' }}
                    value={row.value || undefined}
                    options={PROJECT_LIST_PROGRESS_OPTIONS.map(v => ({ value: v, label: v }))}
                    onChange={v => updateProjectListFilterDraftRow(row.id, { value: v ?? '' })}
                  />
                ) : row.field === 'healthStatus' && (row.op === 'eq' || row.op === 'neq') ? (
                  <Select
                    size="small"
                    allowClear
                    placeholder="选择健康度"
                    style={{ minWidth: 160, flex: '1 1 160px' }}
                    value={row.value || undefined}
                    options={PROJECT_LIST_HEALTH_OPTIONS.map(v => ({ value: v, label: v }))}
                    onChange={v => updateProjectListFilterDraftRow(row.id, { value: v ?? '' })}
                  />
                ) : row.field === 'visibility' && (row.op === 'eq' || row.op === 'neq') ? (
                  <Select
                    size="small"
                    allowClear
                    placeholder="选择可见范围"
                    style={{ minWidth: 200, flex: '1 1 200px' }}
                    value={row.value || undefined}
                    options={PROJECT_LIST_VISIBILITY_OPTIONS.map(v => ({ value: v, label: v }))}
                    onChange={v => updateProjectListFilterDraftRow(row.id, { value: v ?? '' })}
                  />
                ) : row.field === 'templateName' && row.op === 'eq' && distinctTemplateNames.length > 0 ? (
                  <Select
                    size="small"
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    placeholder="选择模板"
                    style={{ minWidth: 160, flex: '1 1 160px' }}
                    value={row.value || undefined}
                    options={distinctTemplateNames.map(t => ({ value: t, label: t }))}
                    onChange={v => updateProjectListFilterDraftRow(row.id, { value: v ?? '' })}
                  />
                ) : (
                  <Input
                    size="small"
                    allowClear
                    placeholder={row.field === 'title' ? '输入项目名称' : row.field === 'owner' ? '输入负责人' : row.field === 'templateName' ? '输入模板名称' : '输入关键字'}
                    style={{ minWidth: 160, flex: '1 1 160px' }}
                    value={row.value}
                    onChange={e => updateProjectListFilterDraftRow(row.id, { value: e.target.value })}
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
                      return next.length ? next : [defaultProjectListFilterRow()]
                    })
                  }
                />
              </div>
            ))}
          </div>
          <Button type="link" size="small" className="wt-my-tasks__filter-panel__add" onClick={() => setFilterDraftRows(prev => [...prev, defaultProjectListFilterRow()])}>
            + 新增筛选条件
          </Button>
          <Divider style={{ margin: '12px 0' }} />
          <div className="wt-my-tasks__filter-panel__footer">
            <Button
              type="link"
              size="small"
              onClick={() => {
                setAppliedFilterRows([])
                setFilterDraftRows([defaultProjectListFilterRow()])
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
                    op: normalizeAllProjectFilterOp(r.field, r.op)
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

  return (
    <div className="wt-content-inner">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          全部项目
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={handleOpenCreate}>
          新建项目
        </Button>
      </div>

      <div className="wt-all-projects-toolbar wt-my-tasks__toolbar">
        <div className="wt-my-tasks__toolbar-main">
          <Input
            className="wt-target-page__search wt-all-projects__search"
            value={searchDraft}
            onChange={e => setSearchDraft(e.target.value)}
            onPressEnter={() => setSearchQuery(searchDraft.trim())}
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="搜索项目，按 Enter 生效"
            variant="borderless"
            allowClear
            style={{ flex: '1 1 200px', maxWidth: 360, minWidth: 160 }}
          />
          <Divider type="vertical" style={{ height: 18, margin: 0, borderColor: 'rgba(0, 0, 0, 0.12)' }} />
          <Space size={12} wrap align="center">
            {renderAllProjectsFilterControl()}
            <Dropdown
              menu={{
                items: [
                  { key: 'card', label: '卡片', icon: <AppstoreOutlined /> },
                  { key: 'table', label: '表格', icon: <TableOutlined /> }
                ],
                selectable: true,
                selectedKeys: [viewMode],
                onClick: ({ key }) => setViewMode(key as ProjectListViewMode)
              }}
              trigger={['click']}
            >
              <Button type="text" size="small" style={{ color: 'rgba(0,0,0,0.45)', paddingInline: 8 }}>
                {viewMode === 'card' ? '卡片' : '表格'}
                <DownOutlined style={{ marginLeft: 4, fontSize: 10 }} />
              </Button>
            </Dropdown>
            <Select
              value={statusFilter}
              onChange={v => setStatusFilter(v as ProjectStatusFilter)}
              style={{ width: 120 }}
              options={[
                { value: 'doing', label: '进行中' },
                { value: 'todo', label: '未开始' },
                { value: 'acceptance', label: '验收中' },
                { value: 'done', label: '已完成' },
                { value: 'archived', label: '已归档' },
                { value: 'all', label: '全部' }
              ]}
            />
            <Typography.Text type="secondary">{totalCount} 个项目</Typography.Text>
          </Space>
        </div>
      </div>

      {viewMode === 'card' ? (
        <Row gutter={[12, 12]}>
          {pagedRows.map(({ project: p }) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={p.id}>
              <Card className="wt-project-card" hoverable styles={{ body: { padding: 0 } }} onClick={() => onOpenProject?.(p)} onMouseEnter={() => setHoverProjectId(p.id)} onMouseLeave={() => setHoverProjectId(prev => (prev === p.id ? null : prev))}>
                {p.cover === 'gradient' ? (
                  <div className="wt-project-card__cover wt-project-card__cover--gradient">
                    <AppstoreOutlined style={{ fontSize: 34, color: 'rgba(255,255,255,0.92)' }} />
                  </div>
                ) : (
                  <div
                    className="wt-project-card__cover"
                    style={{
                      background: `url(${p.image}) center/cover no-repeat`
                    }}
                  />
                )}
                <div className="wt-project-card__title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                  {hoverProjectId === p.id ? (
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          {
                            key: 'project-info',
                            label: '项目信息'
                          },
                          {
                            key: 'more-settings',
                            label: '更多设置'
                          }
                        ],
                        onClick: ({ key, domEvent }) => {
                          domEvent.preventDefault()
                          domEvent.stopPropagation()
                          if (key === 'project-info') {
                            handleOpenProjectInfo(p)
                            return
                          }
                          if (key === 'more-settings') {
                            onOpenProjectSettings?.(p)
                          }
                        }
                      }}
                    >
                      <Button type="text" size="small" icon={<MoreOutlined />} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} />
                    </Dropdown>
                  ) : null}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <div className="wt-my-tasks__table-wrap wt-all-projects__table-wrap wt-all-projects-table">
          <table className="wt-my-tasks__table wt-all-projects__table">
            <thead>
              <tr>
                <th className="wt-my-tasks__table-index wt-all-projects__th--index">#</th>
                {renderSortableTh('项目名称', 'title', { minWidth: 200 })}
                {renderSortableTh('模板', 'templateName', { width: 140 })}
                {renderSortableTh('状态', 'progressStatus', { width: 136 })}
                {renderSortableTh('负责人', 'owner', { width: 176 })}
                {renderSortableTh('可见范围', 'visibility', { minWidth: 160, maxWidth: 260 })}
                {renderSortableTh('开始时间', 'startDate', { width: 120 })}
                {renderSortableTh('截止时间', 'endDate', { width: 120 })}
                {renderSortableTh('创建时间', 'createdAt', { width: 172 })}
                <th className="wt-all-projects__th wt-all-projects__th--actions" style={{ width: 56 }} aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {pagedRows.map(({ project: p, snap }, index) => (
                <tr key={p.id} tabIndex={0} className="wt-all-projects__row" onClick={() => onOpenProject?.(p)}>
                  <td className="wt-my-tasks__table-index">{(listPage - 1) * listPageSize + index + 1}</td>
                  <td>
                    <div className="wt-my-tasks__table-title wt-all-projects__cell-title">{p.title}</div>
                  </td>
                  <td className="wt-all-projects__td-muted">{snap.templateName || '—'}</td>
                  <td>
                    <UnifiedWorkflowStatusTag status={snap.progressStatus || undefined} />
                  </td>
                  <td>{renderOwnerTableCell(snap.owner, p.backendOwnerUserId)}</td>
                  <td>
                    <span className="wt-all-projects__visibility" title={snap.visibility || undefined}>
                      {snap.visibility || '—'}
                    </span>
                  </td>
                  <td className="wt-all-projects__td-date">{formatListCellDate(snap.startDate)}</td>
                  <td className="wt-all-projects__td-date">{formatListCellDate(snap.endDate)}</td>
                  <td className="wt-all-projects__td-date wt-all-projects__td-datetime">{snap.createdAtDisplay || '—'}</td>
                  <td className="wt-all-projects__td-actions" onClick={e => e.stopPropagation()}>
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          { key: 'project-info', label: '项目信息' },
                          { key: 'more-settings', label: '更多设置' }
                        ],
                        onClick: ({ key, domEvent }) => {
                          domEvent.preventDefault()
                          domEvent.stopPropagation()
                          if (key === 'project-info') handleOpenProjectInfo(p)
                          if (key === 'more-settings') onOpenProjectSettings?.(p)
                        }
                      }}
                    >
                      <Button type="text" size="small" icon={<MoreOutlined />} className="wt-all-projects__row-more" />
                    </Dropdown>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <Pagination
          size="small"
          current={listPage}
          pageSize={listPageSize}
          total={totalCount}
          showSizeChanger
          showQuickJumper
          pageSizeOptions={[10, 20, 50]}
          onChange={(page, size) => {
            setListPage(page)
            if (size !== listPageSize) setListPageSize(size)
          }}
          showTotal={(total: number, range: [number, number]) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`}
        />
      </div>

      <Modal
        open={createOpen}
        title="新建项目"
        width={680}
        className="wt-create-project-modal"
        destroyOnHidden
        onCancel={handleCloseCreate}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" onClick={handleCreate}>
              确定
            </Button>
          </div>
        }
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            label="项目名称"
            name="title"
            rules={[
              { required: true, message: '请输入项目名称' },
              { max: 60, message: '项目名称最多 60 个字符' }
            ]}
          >
            <Input
              placeholder="请输入项目名称"
              maxLength={60}
              showCount={{
                formatter: ({ value }: { count: number; maxLength?: number; value: string }) => `${value?.length ?? 0} / ${60}`
              }}
              allowClear
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="项目模板" name="templateId" rules={[{ required: true, message: '请选择项目模板' }]}>
                <Select placeholder="请选择项目模板" options={templateOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="项目成员" name="members">
                <Select mode="multiple" allowClear placeholder="选择项目成员" options={contactSelectOptions} optionFilterProp="label" maxTagCount="responsive" showSearch />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="可见范围" name="visibility" rules={[{ required: true, message: '请选择可见范围' }]}>
                <Select
                  placeholder="选择可见范围"
                  options={[
                    { value: '公开（企业所有成员）', label: '公开（企业所有成员）' },
                    { value: '私有（仅加入的项目成员）', label: '私有（仅加入的项目成员）' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="负责人" name="owner">
                <Select allowClear placeholder="选择负责人" options={contactSelectOptions} showSearch optionFilterProp="label" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="开始时间" name="startDate">
                <DatePicker style={{ width: '100%' }} placeholder="选择开始时间" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="截止时间" name="endDate">
                <DatePicker style={{ width: '100%' }} placeholder="选择截止时间" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="项目描述">
            <Input.TextArea placeholder="请输入项目描述（纯文本）" rows={6} showCount maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={projectInfoOpen}
        title="项目信息"
        width={980}
        okText="保存修改"
        cancelText="取消"
        onOk={handleSaveProjectInfo}
        destroyOnHidden
        okButtonProps={projectInfoPublicReadonly ? { disabled: true } : undefined}
        onCancel={() => {
          setProjectInfoOpen(false)
          setProjectInfoTarget(null)
          projectInfoForm.resetFields()
        }}
      >
        {projectInfoTarget ? (
          <Row gutter={24}>
            <Col span={16}>
              <Form form={projectInfoForm} layout="vertical" disabled={projectInfoPublicReadonly}>
                {projectInfoPublicReadonly ? <div style={{ marginBottom: 12, padding: '8px 12px', border: '1px solid #ffe58f', background: '#fffbe6', color: '#ad6800', borderRadius: 6 }}>公开项目所有人可查看；仅项目成员可编辑此处信息。</div> : null}
                <Typography.Text type="secondary">基本信息</Typography.Text>
                <div style={{ marginTop: 12 }}>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Typography.Text type="secondary">项目名称</Typography.Text>
                      <Form.Item
                        name="title"
                        rules={[
                          { required: true, message: '请输入项目名称' },
                          { max: 60, message: '项目名称最多 60 个字符' }
                        ]}
                        style={{ margin: 0 }}
                      >
                        <Input style={{ marginTop: 6 }} placeholder="请输入项目名称" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary">负责人</Typography.Text>
                      <Form.Item name="owner" rules={[{ required: true, message: '请选择负责人' }]} style={{ margin: 0 }}>
                        <Select style={{ marginTop: 6 }} options={contactSelectOptions} showSearch optionFilterProp="label" placeholder={contactSelectOptions.length ? '选择通讯录成员' : '通讯录暂无数据'} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={12} style={{ marginTop: 10 }}>
                    <Col span={12}>
                      <Typography.Text type="secondary">开始时间</Typography.Text>
                      <Form.Item name="startDate" rules={[{ required: true, message: '请选择开始时间' }]} style={{ margin: 0 }}>
                        <DatePicker style={{ marginTop: 6, width: '100%' }} format="YYYY-MM-DD" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary">截止时间</Typography.Text>
                      <Form.Item name="endDate" rules={[{ required: true, message: '请选择截止时间' }]} style={{ margin: 0 }}>
                        <DatePicker style={{ marginTop: 6, width: '100%' }} format="YYYY-MM-DD" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <div style={{ marginTop: 10 }}>
                    <Typography.Text type="secondary">项目描述</Typography.Text>
                    <Form.Item name="description" style={{ margin: 0 }}>
                      <Input.TextArea style={{ marginTop: 6 }} rows={4} placeholder="请输入项目描述" />
                    </Form.Item>
                  </div>
                  <Divider style={{ margin: '14px 0' }} />
                  <Typography.Text type="secondary">状态信息</Typography.Text>
                  <div style={{ marginTop: 10 }}>
                    <Typography.Text type="secondary">项目状态</Typography.Text>
                    <div style={{ marginTop: 8 }}>
                      <Form.Item name="progressStatus" style={{ margin: 0 }}>
                        <Select
                          options={[
                            { value: '未开始', label: '未开始' },
                            { value: '进行中', label: '进行中' },
                            { value: '验收中', label: '验收中' },
                            { value: '已完成', label: '已完成' },
                            { value: '关闭', label: '关闭' }
                          ]}
                          style={{ width: 180 }}
                        />
                      </Form.Item>
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Typography.Text type="secondary">健康度</Typography.Text>
                    <div style={{ marginTop: 8 }}>
                      <Form.Item name="healthStatus" style={{ margin: 0 }}>
                        <Select
                          options={[
                            { value: '正常', label: '正常' },
                            { value: '有风险', label: '有风险' },
                            { value: '失控', label: '失控' }
                          ]}
                          style={{ width: 180 }}
                        />
                      </Form.Item>
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Typography.Text type="secondary">状态描述</Typography.Text>
                    <Form.Item name="statusDescription" style={{ margin: 0 }}>
                      <Input.TextArea style={{ marginTop: 6 }} rows={4} placeholder="请输入状态描述" />
                    </Form.Item>
                  </div>
                </div>
              </Form>
            </Col>
            <Col span={8}>
              <div
                style={{
                  position: 'relative',
                  height: 118,
                  borderRadius: 8,
                  background: projectInfoTarget.cover === 'image' && projectInfoTarget.image ? `url(${projectInfoTarget.image}) center/cover no-repeat` : 'linear-gradient(145deg, #5aa7f0 0%, #3b82c4 55%, #2f6fb0 100%)'
                }}
                onMouseEnter={() => setProjectCoverHover(true)}
                onMouseLeave={() => setProjectCoverHover(false)}
              >
                {projectCoverHover && !projectInfoPublicReadonly ? <Button type="primary" shape="circle" icon={<CameraOutlined />} size="small" style={{ position: 'absolute', right: 8, top: 8 }} onClick={() => coverUploadInputRef.current?.click()} /> : null}
              </div>
              <input ref={coverUploadInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadProjectCover} />
              <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <Typography.Text type="secondary">可见范围</Typography.Text>
                  <Form form={projectInfoForm} layout="vertical" component={false}>
                    <Form.Item name="visibility" style={{ margin: 0 }}>
                      <Select
                        style={{ width: 190 }}
                        options={[
                          { value: '公开（企业所有成员）', label: '公开（企业所有成员）' },
                          { value: '私有（仅加入的项目成员）', label: '私有（仅加入的项目成员）' }
                        ]}
                      />
                    </Form.Item>
                  </Form>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <Typography.Text type="secondary">所属模板</Typography.Text>
                  <Typography.Text>{projectTemplateConfigs.find(item => item.id === projectInfoTarget.templateId)?.name ?? '项目管理'}</Typography.Text>
                </div>
                <Divider style={{ margin: '2px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <Typography.Text type="secondary">创建人</Typography.Text>
                  <Space size={6}>
                    <Avatar size={20} style={{ background: '#ffccc7', color: '#cf1322', fontSize: 10 }}>
                      {(projectInfoDrawerMeta?.owner || '—').slice(0, 2).toUpperCase()}
                    </Avatar>
                    <Typography.Text>{projectInfoDrawerMeta?.owner || '—'}</Typography.Text>
                  </Space>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <Typography.Text type="secondary">创建时间</Typography.Text>
                  <Typography.Text>{projectInfoDrawerMeta && dayjs(projectInfoDrawerMeta.createdAt).isValid() ? dayjs(projectInfoDrawerMeta.createdAt).format('M月D日') : '—'}</Typography.Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <Typography.Text type="secondary">更新时间</Typography.Text>
                  <Typography.Text>{projectInfoDrawerMeta && dayjs(projectInfoDrawerMeta.updatedAt).isValid() ? dayjs(projectInfoDrawerMeta.updatedAt).format('M月D日') : dayjs().format('M月D日')}</Typography.Text>
                </div>
                <div style={{ display: 'none' }}>
                  <Form form={projectInfoForm} layout="vertical" component={false}>
                    <Form.Item name="templateId" style={{ margin: 0 }}>
                      <Input />
                    </Form.Item>
                  </Form>
                </div>
              </div>
            </Col>
          </Row>
        ) : null}
      </Modal>
    </div>
  )
}
