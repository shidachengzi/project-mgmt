import { isDeepStrictEqual } from 'node:util'
import { prisma } from '@/lib/prisma'

/**
 * 工作区在数据库中存为单列 JSON，便于一次 PATCH 合并、避免多表事务与版本不一致。
 * 代码层已按语义拆成 overview / attachments / overviewActivities / activityByKey / commentsByKey / taskParticipantsByKey；
 * taskAttachmentsByKey：任务/子任务 key → 附件列表（与前端任务管理附件结构一致）；
 * 若将来阅读或迁移需要，可把 overview 等改为独立 Json 列或关系表，再在此服务内组装同一 DTO。
 */
export type ProjectWorkspaceDTO = {
  overview: Record<string, unknown>
  attachments: unknown[]
  overviewActivities: unknown[]
  activityByKey: Record<string, unknown[]>
  commentsByKey: Record<string, unknown[]>
  /** 任务/子任务 key → 参与人姓名列表（与前端 taskParticipantsByKey 一致） */
  taskParticipantsByKey: Record<string, string[]>
  /** 任务/子任务 key → 附件列表（与前端 TaskAttachmentItem 一致） */
  taskAttachmentsByKey: Record<string, unknown[]>
  /** 目标 key → 关联任务列表（taskKey + relation） */
  targetRelatedTasksByKey: Record<string, unknown[]>
  /** 目标 key → 附件列表（含 dataUrl 等，与前端 TargetAttachmentItem 一致） */
  targetAttachmentsByKey: Record<string, unknown[]>
}

const emptyWorkspace = (): ProjectWorkspaceDTO => ({
  overview: {},
  attachments: [],
  overviewActivities: [],
  activityByKey: {},
  commentsByKey: {},
  taskParticipantsByKey: {},
  taskAttachmentsByKey: {},
  targetRelatedTasksByKey: {},
  targetAttachmentsByKey: {},
})

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function asActivityMap(v: unknown): Record<string, unknown[]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const o = v as Record<string, unknown>
  const out: Record<string, unknown[]> = {}
  for (const [k, val] of Object.entries(o)) {
    if (Array.isArray(val)) out[k] = val
  }
  return out
}

function asCommentsMap(v: unknown): Record<string, unknown[]> {
  return asActivityMap(v)
}

function asStringKeyArrayMap(v: unknown): Record<string, unknown[]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const o = v as Record<string, unknown>
  const out: Record<string, unknown[]> = {}
  for (const [k, val] of Object.entries(o)) {
    if (Array.isArray(val)) out[k] = val
  }
  return out
}

function asTaskParticipantsMap(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const o = v as Record<string, unknown>
  const out: Record<string, string[]> = {}
  for (const [k, val] of Object.entries(o)) {
    if (Array.isArray(val)) {
      out[k] = val.filter((x): x is string => typeof x === 'string')
    }
  }
  return out
}

export function parseWorkspace(raw: unknown): ProjectWorkspaceDTO {
  const base = emptyWorkspace()
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return base
  const w = raw as Record<string, unknown>
  return {
    overview: asRecord(w.overview),
    attachments: Array.isArray(w.attachments) ? w.attachments : [],
    overviewActivities: Array.isArray(w.overviewActivities) ? w.overviewActivities : [],
    activityByKey: asActivityMap(w.activityByKey),
    commentsByKey: asCommentsMap(w.commentsByKey),
    taskParticipantsByKey: asTaskParticipantsMap(w.taskParticipantsByKey),
    taskAttachmentsByKey: asStringKeyArrayMap(w.taskAttachmentsByKey),
    targetRelatedTasksByKey: asStringKeyArrayMap(w.targetRelatedTasksByKey),
    targetAttachmentsByKey: asStringKeyArrayMap(w.targetAttachmentsByKey),
  }
}

export function mergeWorkspace(existing: ProjectWorkspaceDTO, patch: Partial<ProjectWorkspaceDTO>): ProjectWorkspaceDTO {
  return {
    overview:
      patch.overview !== undefined ? { ...existing.overview, ...asRecord(patch.overview) } : { ...existing.overview },
    attachments: patch.attachments !== undefined ? [...patch.attachments] : [...existing.attachments],
    overviewActivities:
      patch.overviewActivities !== undefined ? [...patch.overviewActivities] : [...existing.overviewActivities],
    activityByKey:
      patch.activityByKey !== undefined
        ? { ...existing.activityByKey, ...patch.activityByKey }
        : { ...existing.activityByKey },
    commentsByKey:
      patch.commentsByKey !== undefined
        ? { ...existing.commentsByKey, ...patch.commentsByKey }
        : { ...existing.commentsByKey },
    taskParticipantsByKey:
      patch.taskParticipantsByKey !== undefined
        ? { ...existing.taskParticipantsByKey, ...asTaskParticipantsMap(patch.taskParticipantsByKey) }
        : { ...existing.taskParticipantsByKey },
    taskAttachmentsByKey:
      patch.taskAttachmentsByKey !== undefined
        ? { ...existing.taskAttachmentsByKey, ...asStringKeyArrayMap(patch.taskAttachmentsByKey) }
        : { ...existing.taskAttachmentsByKey },
    targetRelatedTasksByKey:
      patch.targetRelatedTasksByKey !== undefined
        ? { ...asStringKeyArrayMap(patch.targetRelatedTasksByKey) }
        : { ...existing.targetRelatedTasksByKey },
    targetAttachmentsByKey:
      patch.targetAttachmentsByKey !== undefined
        ? { ...asStringKeyArrayMap(patch.targetAttachmentsByKey) }
        : { ...existing.targetAttachmentsByKey },
  }
}

const WORKSPACE_TOP_LEVEL_KEYS: (keyof ProjectWorkspaceDTO)[] = [
  'overview',
  'attachments',
  'overviewActivities',
  'activityByKey',
  'commentsByKey',
  'taskParticipantsByKey',
  'taskAttachmentsByKey',
  'targetRelatedTasksByKey',
  'targetAttachmentsByKey',
]

/** 合并 patch 后，与当前工作区相比实际发生变化的顶层字段（用于按字段鉴权） */
export function diffWorkspaceChangedKeys(
  current: ProjectWorkspaceDTO,
  patch: Partial<ProjectWorkspaceDTO>,
): (keyof ProjectWorkspaceDTO)[] {
  const merged = mergeWorkspace(current, patch)
  return WORKSPACE_TOP_LEVEL_KEYS.filter((k) => !isDeepStrictEqual(merged[k], current[k]))
}

export async function getProjectWorkspace(projectId: string) {
  const row = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspace: true },
  })
  if (!row) return { error: 'NOT_FOUND' as const }
  return { workspace: parseWorkspace(row.workspace) }
}

export async function patchProjectWorkspace(projectId: string, patch: Partial<ProjectWorkspaceDTO>) {
  const row = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspace: true },
  })
  if (!row) return { error: 'NOT_FOUND' as const }
  const current = parseWorkspace(row.workspace)
  const merged = mergeWorkspace(current, patch)
  await prisma.project.update({
    where: { id: projectId },
    data: { workspace: merged as object, updatedAt: new Date() },
  })
  return { workspace: merged }
}
