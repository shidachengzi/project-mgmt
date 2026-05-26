import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { applyParentStatusRollupToRows, loadSubtaskStatusesByParentId } from '@/lib/taskParentStatusRollup'
import { parseWorkspace } from '@/modules/projects/projectWorkspaceService'

export type MyTaskListItemDTO = {
  projectId: string
  projectTitle: string
  itemKey: string
  kind: 'target' | 'task'
  title: string
  status: string
  priority: string
  start: string | null
  end: string | null
  ownerUserId: string | null
  ownerName: string | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
  /** 任务/子任务简要描述；与「我的任务」内联创建约定：`任务`→通用任务，`部门会议`→会议，`无`→项目任务 */
  description: string | null
  /** 工作区 taskParticipantsByKey 中姓名解析后的参与人用户 id（与邀请成员逻辑一致） */
  participantUserIds: string[]
}

function fmtYmd(d: Date | null): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

function normParticipantName(s: string): string {
  return s.trim()
}

/** 工作区 taskParticipantsByKey 中列出当前用户姓名的任务 id */
function taskIdsWhereUserInWorkspaceParticipants(workspaceRaw: unknown, userDisplayName: string): string[] {
  const want = normParticipantName(userDisplayName)
  if (!want) return []
  const ws = parseWorkspace(workspaceRaw)
  const out: string[] = []
  for (const [taskKey, names] of Object.entries(ws.taskParticipantsByKey)) {
    if (names.some(n => normParticipantName(n) === want)) out.push(taskKey)
  }
  return out
}

function mapRow(
  r: {
    id: string
    projectId: string
    kind: string
    title: string
    status: string
    priority: string
    startDate: Date | null
    endDate: Date | null
    ownerUserId: string | null
    createdByUserId: string | null
    description: string | null
    createdAt: Date
    updatedAt: Date
    owner: { name: string } | null
  },
  projectTitle: string,
  participantUserIds: string[]
): MyTaskListItemDTO {
  return {
    projectId: r.projectId,
    projectTitle,
    itemKey: r.id,
    kind: r.kind === 'target' ? 'target' : 'task',
    title: r.title,
    status: r.status,
    priority: r.priority,
    start: fmtYmd(r.startDate),
    end: fmtYmd(r.endDate),
    ownerUserId: r.ownerUserId,
    ownerName: r.owner?.name ?? null,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    description: r.description,
    participantUserIds
  }
}

/** 各项目工作区参与人姓名 → 用户 id，供列表筛选「参与人」 */
async function buildParticipantUserIdsByProjectTaskKey(projects: { id: string; workspace: unknown }[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const allNames = new Set<string>()
  const pending: Array<{ compositeKey: string; names: string[] }> = []

  for (const p of projects) {
    const ws = parseWorkspace(p.workspace)
    for (const [taskKey, names] of Object.entries(ws.taskParticipantsByKey)) {
      const normalized: string[] = []
      for (const n of names) {
        const t = normParticipantName(typeof n === 'string' ? n : '')
        if (!t) continue
        normalized.push(t)
        allNames.add(t)
      }
      pending.push({ compositeKey: `${p.id}:${taskKey}`, names: normalized })
    }
  }

  if (allNames.size === 0) {
    return out
  }

  const users = await prisma.user.findMany({
    where: { status: 'active', name: { in: [...allNames] } },
    select: { id: true, name: true }
  })
  const nameToId = new Map<string, string>()
  for (const u of users) {
    const k = normParticipantName(u.name)
    if (k && !nameToId.has(k)) nameToId.set(k, u.id)
  }

  for (const { compositeKey, names } of pending) {
    const ids: string[] = []
    const seen = new Set<string>()
    for (const n of names) {
      const id = nameToId.get(n)
      if (id && !seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
    out.set(compositeKey, ids)
  }
  return out
}

const WORK_ITEM_KINDS = ['target', 'task', 'subtask'] as const

type MyTaskRow = {
  id: string
  projectId: string
  kind: string
  title: string
  status: string
  priority: string
  startDate: Date | null
  endDate: Date | null
  ownerUserId: string | null
  createdByUserId: string | null
  description: string | null
  createdAt: Date
  updatedAt: Date
  owner: { name: string } | null
}

async function mapMyTaskRowsWithEffectiveParentStatus(
  rows: MyTaskRow[],
  idToTitle: Map<string, string>,
  participantIdsForRow: (projectId: string, taskId: string) => string[],
): Promise<MyTaskListItemDTO[]> {
  const parentIds = [...new Set(rows.filter(r => r.kind === 'task').map(r => r.id))]
  const subtasksByParentId = await loadSubtaskStatusesByParentId(parentIds)
  const rolled = applyParentStatusRollupToRows(rows, subtasksByParentId)
  return rolled.map(r => mapRow(r, idToTitle.get(r.projectId) ?? '', participantIdsForRow(r.projectId, r.id)))
}

/**
 * 我的任务列表（需对项目有成员或公开可见权限）
 * - responsible：责任人为当前用户的目标与任务（含子任务）
 * - participated：仅任务/子任务，且工作区 taskParticipantsByKey 中参与人姓名含当前用户（不含目标、不含「仅负责人为他人」）
 * - created：由当前用户创建的任务与子任务（不含目标；依赖 createdByUserId）
 */
export async function listMyTasks(userId: string, scope: 'responsible' | 'participated' | 'created'): Promise<MyTaskListItemDTO[]> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true }
  })
  const userDisplayName = me?.name?.trim() ?? ''

  const projects = await prisma.project.findMany({
    where: {
      archived: false,
      OR: [{ visibility: 'public' }, { members: { some: { userId } } }]
    },
    select: { id: true, title: true, workspace: true },
    orderBy: { updatedAt: 'desc' }
  })

  const idToTitle = new Map(projects.map(p => [p.id, p.title]))
  const ids = [...idToTitle.keys()]
  if (ids.length === 0) return []

  const participantIdsByProjectTask = await buildParticipantUserIdsByProjectTaskKey(projects)
  const participantIdsForRow = (projectId: string, taskId: string) => participantIdsByProjectTask.get(`${projectId}:${taskId}`) ?? []

  const baseWhere: Prisma.ProjectTaskWhereInput = {
    projectId: { in: ids },
    kind: { in: [...WORK_ITEM_KINDS] }
  }

  if (scope === 'responsible') {
    const rows = await prisma.projectTask.findMany({
      where: { ...baseWhere, ownerUserId: userId },
      include: { owner: { select: { name: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    })
    return mapMyTaskRowsWithEffectiveParentStatus(rows, idToTitle, participantIdsForRow)
  }

  if (scope === 'created') {
    const rows = await prisma.projectTask.findMany({
      where: {
        projectId: { in: ids },
        kind: { in: ['task', 'subtask'] },
        createdByUserId: userId
      },
      include: { owner: { select: { name: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    })
    return mapMyTaskRowsWithEffectiveParentStatus(rows, idToTitle, participantIdsForRow)
  }

  // participated
  const participantKeysByProject = new Map<string, Set<string>>()
  const addKeys = (projectId: string, keys: string[]) => {
    if (!keys.length) return
    let s = participantKeysByProject.get(projectId)
    if (!s) {
      s = new Set()
      participantKeysByProject.set(projectId, s)
    }
    for (const k of keys) s.add(k)
  }

  for (const p of projects) {
    addKeys(p.id, taskIdsWhereUserInWorkspaceParticipants(p.workspace, userDisplayName))
  }

  const orBranches: Prisma.ProjectTaskWhereInput[] = []
  for (const [pid, keySet] of participantKeysByProject) {
    const taskIds = [...keySet]
    if (taskIds.length > 0) {
      orBranches.push({ projectId: pid, id: { in: taskIds } })
    }
  }

  if (orBranches.length === 0) return []

  const rows = await prisma.projectTask.findMany({
    where: {
      projectId: { in: ids },
      kind: { in: ['task', 'subtask'] },
      OR: orBranches
    },
    include: { owner: { select: { name: true } } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
  })

  const seen = new Set<string>()
  const deduped: typeof rows = []
  for (const r of rows) {
    const k = `${r.projectId}:${r.id}`
    if (seen.has(k)) continue
    seen.add(k)
    deduped.push(r)
  }

  return mapMyTaskRowsWithEffectiveParentStatus(deduped, idToTitle, participantIdsForRow)
}
