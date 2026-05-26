import { prisma } from '@/lib/prisma'
import { buildProjectPermissionKey } from '@/lib/permissionMap'
import { hasProjectPermission } from '@/lib/rbac'
import { ensurePersonalDeskProject, personalDeskProjectId } from '@/modules/me/personalDeskProject'

const TASK_SECTION = '任务管理'
const TARGET_SECTION = '目标管理'
export const PERM_TASK_CREATE = buildProjectPermissionKey(TASK_SECTION, '新建任务')
export const PERM_TASK_EDIT = buildProjectPermissionKey(TASK_SECTION, '编辑任务')
export const PERM_TASK_DELETE = buildProjectPermissionKey(TASK_SECTION, '删除任务')
export const PERM_TASK_STATUS = buildProjectPermissionKey(TASK_SECTION, '修改任务状态')

export const PERM_TARGET_CREATE = buildProjectPermissionKey(TARGET_SECTION, '新建目标')
export const PERM_TARGET_EDIT = buildProjectPermissionKey(TARGET_SECTION, '编辑目标')
export const PERM_TARGET_DELETE = buildProjectPermissionKey(TARGET_SECTION, '删除目标')
export const PERM_TARGET_STATUS = buildProjectPermissionKey(TARGET_SECTION, '修改目标状态')

export type ProjectTaskTreeDTO = {
  key: string
  id: string
  kind: string
  title: string
  status: string
  priority: string
  start: string
  end: string
  ownerUserId: string | null
  ownerName: string | null
  stage: string | null
  description: string
  progress: number
  attachments: number
  sortOrder: number
  createdAt: string
  updatedAt: string
  children?: ProjectTaskTreeDTO[]
}

function fmtDate(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

export function parseDateInput(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const s = String(v).trim()
  if (!s) return null
  const d = new Date(s.length <= 10 ? `${s}T00:00:00.000Z` : s)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function assertCanViewProject(projectId: string, userId: string) {
  if (projectId === personalDeskProjectId(userId)) {
    const project = await ensurePersonalDeskProject(userId)
    return { project }
  }
  /** 他人的个人工作台 `pd-*`：与私有项目相同，已加入成员即可查看（勿在此处一律 FORBIDDEN） */
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) return { error: 'NOT_FOUND' as const }
  if (project.visibility === 'public') return { project }
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } }
  })
  if (!member) return { error: 'FORBIDDEN' as const }
  return { project }
}

async function touchProject(projectId: string) {
  await prisma.project.update({
    where: { id: projectId },
    data: { updatedAt: new Date() }
  })
}

type TaskRow = {
  id: string
  projectId: string
  parentId: string | null
  sortOrder: number
  kind: string
  title: string
  status: string
  priority: string
  startDate: Date | null
  endDate: Date | null
  ownerUserId: string | null
  stageTitle: string | null
  description: string | null
  progress: number
  attachments: number
  createdAt: Date
  updatedAt: Date
  owner: { id: string; name: string } | null
}

function rowToDto(r: TaskRow): ProjectTaskTreeDTO {
  return {
    key: r.id,
    id: r.id,
    kind: r.kind,
    title: r.title,
    status: r.status,
    priority: r.priority,
    start: fmtDate(r.startDate),
    end: fmtDate(r.endDate),
    ownerUserId: r.ownerUserId,
    ownerName: r.owner?.name ?? null,
    stage: r.stageTitle,
    description: r.description ?? '',
    progress: r.progress,
    attachments: r.attachments,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    children: []
  }
}

function buildTree(rows: TaskRow[]): ProjectTaskTreeDTO[] {
  const byId = new Map(rows.map(r => [r.id, { ...rowToDto(r), children: [] as ProjectTaskTreeDTO[] }]))
  const roots: ProjectTaskTreeDTO[] = []
  for (const r of rows) {
    const node = byId.get(r.id)!
    if (!r.parentId) {
      roots.push(node)
    } else {
      const p = byId.get(r.parentId)
      if (p) {
        if (!p.children) p.children = []
        p.children.push(node)
      } else {
        roots.push(node)
      }
    }
  }
  const sortNodes = (list: ProjectTaskTreeDTO[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    list.forEach(n => {
      if (n.children?.length) sortNodes(n.children)
    })
  }
  sortNodes(roots)
  return roots
}

export async function getProjectTaskKind(projectId: string, taskId: string): Promise<string | null> {
  const row = await prisma.projectTask.findFirst({
    where: { id: taskId, projectId },
    select: { kind: true }
  })
  return row?.kind ?? null
}

export async function listProjectTasksTree(projectId: string): Promise<ProjectTaskTreeDTO[]> {
  const rows = await prisma.projectTask.findMany({
    where: { projectId },
    include: { owner: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  })
  return buildTree(rows as TaskRow[])
}

export async function createProjectTask(
  projectId: string,
  input: {
    title: string
    kind?: string
    parentId?: string | null
    status?: string
    priority?: string
    startDate?: Date | null
    endDate?: Date | null
    ownerUserId?: string | null
    /** 创建人（会话用户），写入 DB 供「我创建的」查询 */
    createdByUserId?: string | null
    stageTitle?: string | null
    description?: string | null
    progress?: number
    attachments?: number
    sortOrder?: number
  },
) {
  const title = input.title.trim()
  if (!title) return { error: 'EMPTY_TITLE' as const }
  const kind = ['stage', 'task', 'subtask', 'target'].includes(String(input.kind)) ? String(input.kind) : 'task'

  let parentId: string | null = input.parentId ?? null
  if (kind === 'target') parentId = null
  if (parentId) {
    const p = await prisma.projectTask.findFirst({
      where: { id: parentId, projectId }
    })
    if (!p) return { error: 'PARENT_NOT_FOUND' as const }
  }

  let sortOrder = input.sortOrder
  if (sortOrder === undefined || sortOrder === null) {
    const agg = await prisma.projectTask.aggregate({
      where: { projectId, parentId },
      _max: { sortOrder: true }
    })
    sortOrder = (agg._max.sortOrder ?? -1) + 1
  }

  if (input.ownerUserId) {
    const u = await prisma.user.findUnique({ where: { id: input.ownerUserId } })
    if (!u) return { error: 'OWNER_NOT_FOUND' as const }
  }
  if (input.createdByUserId) {
    const c = await prisma.user.findUnique({ where: { id: input.createdByUserId } })
    if (!c) return { error: 'CREATOR_NOT_FOUND' as const }
  }

  const row = await prisma.projectTask.create({
    data: {
      projectId,
      parentId,
      sortOrder: sortOrder ?? 0,
      kind,
      title: title.slice(0, 191),
      status: (input.status ?? '未开始').toString().slice(0, 64),
      priority: (input.priority ?? '普通').toString().slice(0, 32),
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      ownerUserId: input.ownerUserId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      stageTitle: input.stageTitle?.trim() ? input.stageTitle.trim().slice(0, 191) : null,
      description: input.description ?? null,
      progress: Math.min(100, Math.max(0, input.progress ?? 0)),
      attachments: Math.max(0, input.attachments ?? 0),
    },
  })
  await touchProject(projectId)
  return { ok: true as const, id: row.id }
}

export async function updateProjectTask(
  projectId: string,
  taskId: string,
  patch: {
    title?: string
    kind?: string
    parentId?: string | null
    status?: string
    priority?: string
    startDate?: Date | null
    endDate?: Date | null
    ownerUserId?: string | null
    stageTitle?: string | null
    description?: string | null
    progress?: number
    attachments?: number
    sortOrder?: number
  }
) {
  const existing = await prisma.projectTask.findFirst({
    where: { id: taskId, projectId }
  })
  if (!existing) return { error: 'NOT_FOUND' as const }

  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (patch.parentId === taskId) return { error: 'INVALID_PARENT' as const }
    const p = await prisma.projectTask.findFirst({
      where: { id: patch.parentId, projectId }
    })
    if (!p) return { error: 'PARENT_NOT_FOUND' as const }
  }

  if (patch.ownerUserId) {
    const u = await prisma.user.findUnique({ where: { id: patch.ownerUserId } })
    if (!u) return { error: 'OWNER_NOT_FOUND' as const }
  }

  const data: {
    title?: string
    kind?: string
    parentId?: string | null
    status?: string
    priority?: string
    startDate?: Date | null
    endDate?: Date | null
    ownerUserId?: string | null
    stageTitle?: string | null
    description?: string | null
    progress?: number
    attachments?: number
    sortOrder?: number
  } = {}
  if (patch.title !== undefined) {
    const t = patch.title.trim()
    if (!t) return { error: 'EMPTY_TITLE' as const }
    data.title = t.slice(0, 191)
  }
  if (patch.kind !== undefined) {
    data.kind = ['stage', 'task', 'subtask', 'target'].includes(patch.kind) ? patch.kind : existing.kind
  }
  if (patch.parentId !== undefined) data.parentId = patch.parentId
  if (patch.status !== undefined) data.status = String(patch.status).slice(0, 64)
  if (patch.priority !== undefined) data.priority = String(patch.priority).slice(0, 32)
  if (patch.startDate !== undefined) data.startDate = patch.startDate
  if (patch.endDate !== undefined) data.endDate = patch.endDate
  if (patch.ownerUserId !== undefined) data.ownerUserId = patch.ownerUserId
  if (patch.stageTitle !== undefined) data.stageTitle = patch.stageTitle?.trim() ? String(patch.stageTitle).trim().slice(0, 191) : null
  if (patch.description !== undefined) data.description = patch.description
  if (patch.progress !== undefined) data.progress = Math.min(100, Math.max(0, patch.progress))
  if (patch.attachments !== undefined) data.attachments = Math.max(0, patch.attachments)
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder

  if (Object.keys(data).length === 0) {
    return { ok: true as const }
  }

  await prisma.projectTask.update({
    where: { id: taskId },
    data
  })
  await touchProject(projectId)
  return { ok: true as const }
}

export async function deleteProjectTask(projectId: string, taskId: string) {
  const existing = await prisma.projectTask.findFirst({
    where: { id: taskId, projectId }
  })
  if (!existing) return { error: 'NOT_FOUND' as const }
  await prisma.projectTask.delete({ where: { id: taskId } })
  await touchProject(projectId)
  return { ok: true as const }
}

export async function canPatchTask(userId: string, projectId: string, patch: Record<string, unknown>) {
  const keys = Object.keys(patch).filter(k => patch[k] !== undefined)
  const statusOnly = keys.length > 0 && keys.every(k => ['status', 'progress'].includes(k)) && (keys.includes('status') || keys.includes('progress'))
  if (statusOnly) {
    const ok = (await hasProjectPermission(projectId, userId, PERM_TASK_STATUS)) || (await hasProjectPermission(projectId, userId, PERM_TASK_EDIT))
    return ok
  }
  return hasProjectPermission(projectId, userId, PERM_TASK_EDIT)
}

export async function canPatchTarget(userId: string, projectId: string, patch: Record<string, unknown>) {
  const keys = Object.keys(patch).filter(k => patch[k] !== undefined)
  const statusOnly = keys.length > 0 && keys.every(k => ['status', 'progress'].includes(k)) && (keys.includes('status') || keys.includes('progress'))
  if (statusOnly) {
    return (await hasProjectPermission(projectId, userId, PERM_TARGET_STATUS)) || (await hasProjectPermission(projectId, userId, PERM_TARGET_EDIT))
  }
  return hasProjectPermission(projectId, userId, PERM_TARGET_EDIT)
}
