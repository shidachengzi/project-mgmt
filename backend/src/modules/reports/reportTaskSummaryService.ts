import { prisma } from '@/lib/prisma'
import { listProjectsVisibleToUser, progressStatusFromWorkspace } from '@/modules/projects/projectCatalog'
import { parseWorkspace } from '@/modules/projects/projectWorkspaceService'

function fmtYmd(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

function projectEndDateFromWorkspace(workspace: unknown): string | null {
  const o = parseWorkspace(workspace).overview
  const ed = o.endDate
  if (typeof ed === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ed.trim())) return ed.trim()
  return null
}

/** 与前端报表 TaskRecordLite 对齐（扁平任务/子任务/目标，不含阶段行） */
export type ReportTaskSummaryItemDTO = {
  key: string
  kind: string
  title: string
  status: string
  owner: string | null
  end: string
}

export type ReportProjectTaskSummaryDTO = {
  projectId: string
  projectTitle: string
  projectStatus: string
  projectEndDate: string | null
  tasks: ReportTaskSummaryItemDTO[]
}

/**
 * 当前用户可见项目（与 GET /api/projects 一致）下的任务汇总，供统计报表使用。
 * 仅统计 kind 为 task / subtask / target 的行（与前端 flatten 后口径一致）。
 */
export async function listReportProjectTaskSummaries(userId: string): Promise<ReportProjectTaskSummaryDTO[]> {
  const projects = await listProjectsVisibleToUser(userId)
  if (projects.length === 0) return []

  const projectIds = projects.map(p => p.id)
  const rows = await prisma.projectTask.findMany({
    where: {
      projectId: { in: projectIds },
      kind: { in: ['task', 'subtask', 'target'] },
    },
    include: { owner: { select: { name: true } } },
    orderBy: [{ projectId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  const byProject = new Map<string, ReportTaskSummaryItemDTO[]>()
  for (const pid of projectIds) {
    byProject.set(pid, [])
  }
  for (const r of rows) {
    const list = byProject.get(r.projectId)
    if (!list) continue
    list.push({
      key: r.id,
      kind: r.kind,
      title: r.title,
      status: r.status,
      owner: r.owner?.name?.trim() ? r.owner.name.trim() : null,
      end: fmtYmd(r.endDate),
    })
  }

  return projects.map(p => ({
    projectId: p.id,
    projectTitle: p.title,
    projectStatus: progressStatusFromWorkspace(p.workspace),
    projectEndDate: projectEndDateFromWorkspace(p.workspace),
    tasks: byProject.get(p.id) ?? [],
  }))
}
