import { prisma } from '@/lib/prisma'

/** 与前端 projectTaskAdapter.normalizeParentTaskStatusLike 一致 */
export function effectiveParentTaskStatusFromChildren(parentStatus: string, childStatuses: string[]): string {
  if (childStatuses.length === 0) return parentStatus
  if (parentStatus === '关闭') return parentStatus
  const allDone = childStatuses.every(s => s === '已完成' || s === '关闭')
  if (allDone && parentStatus !== '已完成') return '已完成'
  if (!allDone && parentStatus === '已完成') return '进行中'
  return parentStatus
}

export async function loadSubtaskStatusesByParentId(parentIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (parentIds.length === 0) return out
  const subtasks = await prisma.projectTask.findMany({
    where: { parentId: { in: parentIds }, kind: 'subtask' },
    select: { parentId: true, status: true },
  })
  for (const st of subtasks) {
    if (!st.parentId) continue
    const list = out.get(st.parentId) ?? []
    list.push(st.status)
    out.set(st.parentId, list)
  }
  return out
}

export function applyParentStatusRollupToRows<T extends { id: string; kind: string; status: string }>(
  rows: T[],
  subtasksByParentId: Map<string, string[]>,
): T[] {
  return rows.map(r => {
    if (r.kind !== 'task') return r
    const children = subtasksByParentId.get(r.id)
    if (!children?.length) return r
    const status = effectiveParentTaskStatusFromChildren(r.status, children)
    return status === r.status ? r : { ...r, status }
  })
}
