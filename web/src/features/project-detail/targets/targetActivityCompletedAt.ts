import dayjs from 'dayjs'
import type { WorkspaceActivityRecord } from '../hooks/useProjectDetailWorkspace'
import type { TargetStatus } from './targetTypes'

/** 活动记录中「状态」变为指定值的最新一条时间 */
export function getLatestTargetStatusTransitionAtIso(
  activities: WorkspaceActivityRecord[] | undefined,
  afterStatus: TargetStatus
): string | undefined {
  if (!activities?.length) return undefined
  let bestIso: string | undefined
  let bestMs = -Infinity
  for (const a of activities) {
    if (a.fieldLabel !== '状态') continue
    const after = (a.after ?? '').trim()
    if (after !== afterStatus) continue
    const ms = dayjs(a.createdAt).valueOf()
    if (!Number.isFinite(ms) || ms <= bestMs) continue
    bestMs = ms
    bestIso = a.createdAt
  }
  return bestIso
}

/** 完成时间筛选：优先活动「状态→已完成」时间，若无则取「状态→关闭」时间 */
export function getTargetFilterCompletedAtIsoFromActivities(activities: WorkspaceActivityRecord[] | undefined): string | undefined {
  return getLatestTargetStatusTransitionAtIso(activities, '已完成') ?? getLatestTargetStatusTransitionAtIso(activities, '关闭')
}

export function getLatestTaskStatusTransitionAtIso(
  activities: WorkspaceActivityRecord[] | undefined,
  afterStatus: '未开始' | '进行中' | '搁置中' | '已完成' | '关闭'
): string | undefined {
  if (!activities?.length) return undefined
  let bestIso: string | undefined
  let bestMs = -Infinity
  for (const a of activities) {
    if (a.fieldLabel !== '状态') continue
    if ((a.after ?? '').trim() !== afterStatus) continue
    const ms = dayjs(a.createdAt).valueOf()
    if (!Number.isFinite(ms) || ms <= bestMs) continue
    bestMs = ms
    bestIso = a.createdAt
  }
  return bestIso
}

export function getTaskFilterCompletedAtIsoFromActivities(activities: WorkspaceActivityRecord[] | undefined): string | undefined {
  return getLatestTaskStatusTransitionAtIso(activities, '已完成') ?? getLatestTaskStatusTransitionAtIso(activities, '关闭')
}
