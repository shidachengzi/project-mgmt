import { create } from 'zustand'
import dayjs from 'dayjs'
import { defaultProjectTemplateId } from '../../project/config/projectTemplates'
import type { ProjectSummary } from '../../project/model/types'
import { useProjectStore } from '../../project/model/useProjectStore'
import { ensureDepartmentsContainMembers, useOrgStore } from '../../org/model/useOrgStore'
import {
  adminMemberDtoToOrg,
  fetchAdminDepartmentTree,
  fetchAdminMembers,
  mapAdminDeptTreeToOrg,
} from '../../../shared/api/adminOrgApi'
import {
  buildDirectoryDepartmentTree,
  directoryUserDtoToOrgMember,
  fetchDirectoryUsers,
} from '../../../shared/api/directoryUsersApi'
import { isBackendPersonalDeskProjectId } from '../../project/lib/personalDesk'
import { buildMappedProjectPermissionKey } from '../../permission/projectPermissionMap'
import { isBackendAuthEnabled, resolveBackendUrl } from '../../../shared/api/backendClient'
import { sessionAwareFetch } from '../../../shared/api/sessionAwareFetch'
import { fetchProjectWorkspace, type ProjectWorkspaceClientPayload } from '../../../shared/api/projectWorkspaceApi'

function workspaceOverviewDateToYmd(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return ''
  const t = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const strict = dayjs(t, 'YYYY-MM-DD', true)
  if (strict.isValid()) return strict.format('YYYY-MM-DD')
  const zh = t.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  if (zh) {
    const d = dayjs(`${zh[1]}-${zh[2]}-${zh[3]}`, 'YYYY-M-D', true)
    if (d.isValid()) return d.format('YYYY-MM-DD')
  }
  const md = t.match(/^(\d{1,2})月(\d{1,2})日$/)
  if (md) {
    const d = dayjs(`${dayjs().year()}-${md[1]}-${md[2]}`, 'YYYY-M-D', true)
    if (d.isValid()) return d.format('YYYY-MM-DD')
  }
  const loose = dayjs(t)
  return loose.isValid() ? loose.format('YYYY-MM-DD') : ''
}

type ApiProject = {
  id: string
  title: string
  visibility: string
  ownerUserId: string | null
  archived?: boolean
  progressStatus?: '未开始' | '进行中' | '验收中' | '已完成' | '关闭'
  overviewOwner?: string
  overviewStartDate?: string
  overviewEndDate?: string
  overviewHealthStatus?: string
  coverKind?: 'gradient' | 'image'
  coverImageData?: string | null
  createdAt?: string
  updatedAt: string
}

function workspaceLiteFromApiProject(p: ApiProject): WorkspaceOverviewLite {
  return {
    owner: (p.overviewOwner ?? '').trim(),
    startDate: workspaceOverviewDateToYmd(p.overviewStartDate),
    endDate: workspaceOverviewDateToYmd(p.overviewEndDate),
    progressStatus: safeWorkspaceProgress(p.progressStatus),
    healthStatus: safeWorkspaceHealth(p.overviewHealthStatus),
  }
}

/** 避免 hydrate + useAppBootstrap 重复触发全量 bootstrap */
let bootstrapInFlight: Promise<void> | null = null

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++
      await fn(items[i])
    }
  })
  await Promise.all(workers)
}

type PermMe = {
  userId: string
  roleKeys: string[]
  permissionKeys: string[]
}

type MemberRow = {
  userId: string
  name: string
  email: string | null
  mobile: string | null
  departmentName?: string | null
  roleKey: string | null
}

type RoleRow = {
  id: string
  key: string
  name: string
  note?: string | null
  isDefault: boolean
  permissionKeys: string[]
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T } | null
  if (!res.ok || !json?.ok) return { ok: false }
  return { ok: true, data: json.data as T }
}

const PROJECT_ROLE_MGMT_PERM = buildMappedProjectPermissionKey('项目权限', '角色管理')

async function getJson<T>(path: string): Promise<T | null> {
  const url = resolveBackendUrl(path)
  if (!url) return null
  try {
    const res = await sessionAwareFetch(url, { credentials: 'include' })
    const p = await parseJson<T>(res)
    return p.ok ? p.data : null
  } catch {
    return null
  }
}

type WorkspaceOverviewLite = {
  owner: string
  startDate: string
  endDate: string
  progressStatus: string
  healthStatus: string
}

const WORKSPACE_PROGRESS_VALUES = ['未开始', '进行中', '验收中', '已完成', '关闭'] as const
const WORKSPACE_HEALTH_VALUES = ['正常', '有风险', '失控'] as const

function safeWorkspaceProgress(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  return (WORKSPACE_PROGRESS_VALUES as readonly string[]).includes(s) ? s : ''
}

function safeWorkspaceHealth(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  return (WORKSPACE_HEALTH_VALUES as readonly string[]).includes(s) ? s : ''
}

type BackendDataState = {
  systemRoleKeys: string[]
  systemPermissionKeys: string[]
  systemLoaded: boolean
  memberRoleMapByProject: Record<string, Record<string, string>>
  membersRowsByProject: Record<string, MemberRow[]>
  workspaceOverviewLiteByProject: Record<string, WorkspaceOverviewLite>
  /** refreshProject / 详情页复用，避免重复 GET workspace */
  workspacePayloadByProject: Record<string, ProjectWorkspaceClientPayload>
  myProjectPermissionKeys: Record<string, string[]>
  myProjectRoleKeys: Record<string, string[]>
  projectRolesDetailed: Record<string, RoleRow[]>
  projectsLoaded: boolean
  bootstrap: () => Promise<void>
  clear: () => void
  /** 轻量刷新项目列表与概览摘要（供列表页协作同步，不重复 bootstrap 全量） */
  refreshProjectsList: () => Promise<void>
  refreshProject: (projectId: string) => Promise<void>
  /** 仅刷新成员 + 项目角色（比 refreshProject 少拉 workspace / permissions/me） */
  refreshProjectRbac: (projectId: string) => Promise<void>
  addProjectMember: (projectId: string, userId: string, roleKey: string) => Promise<boolean>
  putMemberRole: (projectId: string, userId: string, roleKey: string) => Promise<boolean>
  removeMember: (projectId: string, userId: string) => Promise<boolean>
}

const initial: Omit<
  BackendDataState,
  'bootstrap' | 'clear' | 'refreshProjectsList' | 'refreshProject' | 'refreshProjectRbac' | 'addProjectMember' | 'putMemberRole' | 'removeMember'
> = {
  systemRoleKeys: [],
  systemPermissionKeys: [],
  systemLoaded: false,
  memberRoleMapByProject: {},
  membersRowsByProject: {},
  workspaceOverviewLiteByProject: {},
  workspacePayloadByProject: {},
  myProjectPermissionKeys: {},
  myProjectRoleKeys: {},
  projectRolesDetailed: {},
  projectsLoaded: false,
}

export const useBackendDataStore = create<BackendDataState>((set, get) => ({
  ...initial,
  clear: () => set({ ...initial }),
  refreshProjectsList: async () => {
    if (!isBackendAuthEnabled()) return
    const rawProjects = await getJson<ApiProject[]>('/api/projects')
    if (!rawProjects) return
    const projects = rawProjects.filter(p => !isBackendPersonalDeskProjectId(p.id))
    const overviewLiteByProject: Record<string, WorkspaceOverviewLite> = {}
    projects.forEach(p => {
      overviewLiteByProject[p.id] = workspaceLiteFromApiProject(p)
    })
    const list: ProjectSummary[] = projects.map(p => ({
      id: p.id,
      title: p.title,
      cover: p.coverKind === 'image' ? 'image' : 'gradient',
      image: p.coverKind === 'image' && p.coverImageData ? p.coverImageData : undefined,
      templateId: defaultProjectTemplateId,
      backendVisibility: p.visibility === 'public' ? 'public' : 'private',
      backendArchived: Boolean(p.archived),
      backendProgressStatus: p.progressStatus,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      backendOwnerUserId: p.ownerUserId ?? null,
    }))
    const prevList = useProjectStore.getState().projectList
    const mergedList = list.map(next => {
      const prev = prevList.find(p => p.id === next.id)
      return prev ? { ...prev, ...next } : next
    })
    useProjectStore.getState().setProjectList(mergedList)
    set(s => ({
      workspaceOverviewLiteByProject: { ...s.workspaceOverviewLiteByProject, ...overviewLiteByProject },
      projectsLoaded: true,
    }))
  },
  bootstrap: async () => {
    if (!isBackendAuthEnabled()) return
    if (bootstrapInFlight) return bootstrapInFlight
    bootstrapInFlight = (async () => {
      set({ projectsLoaded: false })
      const sys = await getJson<PermMe>('/api/system/permissions/me')
      set({
        systemRoleKeys: sys?.roleKeys ?? [],
        systemPermissionKeys: sys?.permissionKeys ?? [],
        systemLoaded: true,
      })

      const [td, tm] = await Promise.all([fetchAdminDepartmentTree(), fetchAdminMembers()])
      if (td.ok && tm.ok) {
        const orgMembers = tm.data.map(adminMemberDtoToOrg)
        const root = mapAdminDeptTreeToOrg(td.data, orgMembers)
        const ensured = ensureDepartmentsContainMembers(orgMembers, [root])
        useOrgStore.getState().setMembers(orgMembers)
        useOrgStore.getState().setDepartments(ensured)
      } else {
        const directory = await fetchDirectoryUsers()
        if (directory?.length) {
          const orgMembers = directory.map(directoryUserDtoToOrgMember)
          const tree = buildDirectoryDepartmentTree(orgMembers)
          const ensured = ensureDepartmentsContainMembers(orgMembers, tree)
          useOrgStore.getState().setMembers(orgMembers)
          useOrgStore.getState().setDepartments(ensured)
        } else {
          useOrgStore.getState().setMembers([])
          useOrgStore.getState().setDepartments([])
        }
      }

      const rawProjects = await getJson<ApiProject[]>('/api/projects')
      if (!rawProjects) {
        set({ projectsLoaded: true, workspaceOverviewLiteByProject: {} })
        useProjectStore.getState().setProjectList([])
        return
      }
      const projects = rawProjects.filter(p => !isBackendPersonalDeskProjectId(p.id))
      const overviewLiteByProject: Record<string, WorkspaceOverviewLite> = {}
      projects.forEach(p => {
        overviewLiteByProject[p.id] = workspaceLiteFromApiProject(p)
      })
      const list: ProjectSummary[] = projects.map(p => ({
        id: p.id,
        title: p.title,
        cover: p.coverKind === 'image' ? 'image' : 'gradient',
        image: p.coverKind === 'image' && p.coverImageData ? p.coverImageData : undefined,
        templateId: defaultProjectTemplateId,
        backendVisibility: p.visibility === 'public' ? 'public' : 'private',
        backendArchived: Boolean(p.archived),
        backendProgressStatus: p.progressStatus,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        backendOwnerUserId: p.ownerUserId ?? null,
      }))
      useProjectStore.getState().setProjectList(list)
      set({ workspaceOverviewLiteByProject: overviewLiteByProject, projectsLoaded: true })

      /** 成员/权限/角色在后台补全，不阻塞工作台与项目列表首屏 */
      void mapWithConcurrency(projects, 4, async p => {
        try {
          await get().refreshProject(p.id)
        } catch {
          // 单项目水合失败（网络/后端重启）不影响其余项目
        }
      })
    })().finally(() => {
      bootstrapInFlight = null
    })
    return bootstrapInFlight
  },
  addProjectMember: async (projectId, userId, roleKey) => {
    const url = resolveBackendUrl(`/api/projects/${encodeURIComponent(projectId)}/members`)
    if (!url) return false
    const res = await sessionAwareFetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, roleKey }),
    })
    if (!res.ok) return false
    return true
  },
  refreshProjectRbac: async projectId => {
    if (!isBackendAuthEnabled()) return
    try {
      const enc = encodeURIComponent(projectId)
      const [me, members] = await Promise.all([
        getJson<PermMe>(`/api/projects/${enc}/permissions/me`),
        getJson<MemberRow[]>(`/api/projects/${enc}/members`),
      ])
      let roles: RoleRow[] | null = null
      if (me?.permissionKeys.includes(PROJECT_ROLE_MGMT_PERM)) {
        const rolesUrl = resolveBackendUrl(`/api/projects/${enc}/roles`)
        if (rolesUrl) {
          const res = await sessionAwareFetch(rolesUrl, { credentials: 'include' })
          const p = await parseJson<RoleRow[]>(res)
          if (p.ok) roles = p.data
        }
      }
      const roleMap: Record<string, string> = {}
      if (members) {
        members.forEach(m => {
          if (m.roleKey) roleMap[m.userId] = m.roleKey
        })
      }
      set(s => ({
        memberRoleMapByProject: { ...s.memberRoleMapByProject, [projectId]: roleMap },
        membersRowsByProject: { ...s.membersRowsByProject, [projectId]: members ?? [] },
        projectRolesDetailed: roles
          ? { ...s.projectRolesDetailed, [projectId]: roles }
          : s.projectRolesDetailed,
      }))
    } catch {
      // ignore network / transient backend errors
    }
  },
  refreshProject: async projectId => {
    if (!isBackendAuthEnabled()) return
    try {
      const enc = encodeURIComponent(projectId)
      const [me, members] = await Promise.all([
        getJson<PermMe>(`/api/projects/${enc}/permissions/me`),
        getJson<MemberRow[]>(`/api/projects/${enc}/members`),
      ])
      let roles: RoleRow[] | null = null
      if (me?.permissionKeys.includes(PROJECT_ROLE_MGMT_PERM)) {
        const rolesUrl = resolveBackendUrl(`/api/projects/${enc}/roles`)
        if (rolesUrl) {
          const res = await sessionAwareFetch(rolesUrl, { credentials: 'include' })
          const p = await parseJson<RoleRow[]>(res)
          if (p.ok) roles = p.data
        }
      }
      const roleMap: Record<string, string> = {}
      if (members) {
        members.forEach(m => {
          if (m.roleKey) roleMap[m.userId] = m.roleKey
        })
      }
      let workspaceLite: WorkspaceOverviewLite = {
        owner: '',
        startDate: '',
        endDate: '',
        progressStatus: '',
        healthStatus: '',
      }
      let workspacePayload: ProjectWorkspaceClientPayload | undefined
      try {
        const ws = await fetchProjectWorkspace(projectId)
        if (ws.ok) {
          workspacePayload = ws.data
          const ov = ws.data.overview || {}
          workspaceLite = {
            owner: typeof ov.owner === 'string' ? ov.owner.trim() : '',
            startDate: workspaceOverviewDateToYmd(ov.startDate),
            endDate: workspaceOverviewDateToYmd(ov.endDate),
            progressStatus: safeWorkspaceProgress(ov.progressStatus),
            healthStatus: safeWorkspaceHealth(ov.healthStatus),
          }
        }
      } catch {
        // workspace 可选；失败时保留列表 API 已写入的 overviewLite
        workspaceLite = get().workspaceOverviewLiteByProject[projectId] ?? workspaceLite
      }
      set(s => ({
        memberRoleMapByProject: { ...s.memberRoleMapByProject, [projectId]: roleMap },
        membersRowsByProject: { ...s.membersRowsByProject, [projectId]: members ?? [] },
        workspaceOverviewLiteByProject: { ...s.workspaceOverviewLiteByProject, [projectId]: workspaceLite },
        workspacePayloadByProject: workspacePayload
          ? { ...s.workspacePayloadByProject, [projectId]: workspacePayload }
          : s.workspacePayloadByProject,
        myProjectPermissionKeys: me
          ? { ...s.myProjectPermissionKeys, [projectId]: me.permissionKeys }
          : s.myProjectPermissionKeys,
        myProjectRoleKeys: me ? { ...s.myProjectRoleKeys, [projectId]: me.roleKeys } : s.myProjectRoleKeys,
        projectRolesDetailed: roles
          ? { ...s.projectRolesDetailed, [projectId]: roles }
          : s.projectRolesDetailed,
      }))
    } catch {
      // ignore network / transient backend errors
    }
  },
  putMemberRole: async (projectId, userId, roleKey) => {
    const url = resolveBackendUrl(
      `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/role`,
    )
    if (!url) return false
    const res = await sessionAwareFetch(url, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleKey }),
    })
    if (!res.ok) return false
    await get().refreshProject(projectId)
    return true
  },
  removeMember: async (projectId, userId) => {
    const url = resolveBackendUrl(
      `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
    )
    if (!url) return false
    const res = await sessionAwareFetch(url, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) return false
    await get().refreshProject(projectId)
    return true
  },
}))
