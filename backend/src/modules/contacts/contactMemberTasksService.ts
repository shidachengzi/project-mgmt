import { applyParentStatusRollupToRows, loadSubtaskStatusesByParentId } from '@/lib/taskParentStatusRollup'
import { prisma } from '@/lib/prisma'

function fmtYmd(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

/**
 * 与「我的任务」可见项目范围一致：公开或当前查看者已是成员。
 * 任务责任人仅能分配给项目成员，故无需对「非成员却是负责人」单独扩项目范围。
 */
export type ContactMemberTaskItemDTO = {
  projectId: string
  projectTitle: string
  itemKey: string
  kind: string
  title: string
  status: string
  end: string
}

/**
 * 在查看者可见项目内，列出目标用户作为责任人的任务/子任务/目标。
 * 私有项目且查看者非成员时不会入选；与「负责人必为成员」的产品规则一致。
 * 调用方须已校验：targetUserId === viewerUserId 或查看者为系统 owner/admin。
 */
export async function listContactMemberTasks(viewerUserId: string, targetUserId: string): Promise<ContactMemberTaskItemDTO[]> {
  const projects = await prisma.project.findMany({
    where: {
      archived: false,
      OR: [{ visibility: 'public' }, { members: { some: { userId: viewerUserId } } }],
    },
    select: { id: true, title: true },
    orderBy: { updatedAt: 'desc' },
  })
  const idToTitle = new Map(projects.map((p) => [p.id, p.title]))
  const projectIds = [...idToTitle.keys()]
  if (projectIds.length === 0) return []

  const rows = await prisma.projectTask.findMany({
    where: {
      projectId: { in: projectIds },
      ownerUserId: targetUserId,
      kind: { in: ['task', 'subtask', 'target'] },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  })

  const parentIds = [...new Set(rows.filter((r) => r.kind === 'task').map((r) => r.id))]
  const subtasksByParentId = await loadSubtaskStatusesByParentId(parentIds)
  const rolled = applyParentStatusRollupToRows(rows, subtasksByParentId)

  return rolled.map((r) => ({
    projectId: r.projectId,
    projectTitle: idToTitle.get(r.projectId) ?? '',
    itemKey: r.id,
    kind: r.kind,
    title: r.title,
    status: r.status,
    end: fmtYmd(r.endDate),
  }))
}
