import dayjs from 'dayjs'
import { normalizeTaskPriority, TASK_PRIORITY_LEVELS } from '../../../shared/ui/priorityWithMarks'
import { targetFilterDayStamp } from './targetTableFilters'
import type { TargetTableSortKey } from './targetToolbarConfig'
import type { TargetRecord, TargetStatus } from './targetTypes'

const TARGET_STATUS_SORT_ORDER: Record<TargetStatus, number> = {
  未开始: 0,
  进行中: 1,
  验收中: 2,
  已完成: 3,
  关闭: 4
}

export function targetSortTimeMs(iso?: string | null): number {
  if (!iso?.trim()) return 0
  const ms = dayjs(iso).valueOf()
  return Number.isFinite(ms) ? ms : 0
}

function targetSortComparable(
  row: TargetRecord,
  sortKey: Exclude<TargetTableSortKey, 'custom' | 'title' | 'owner' | 'createdBy'>,
  completedAtIsoByKey: Record<string, string | undefined>
): number {
  switch (sortKey) {
    case 'completedAt':
      return targetSortTimeMs(completedAtIsoByKey[row.key])
    case 'createdAt':
      return targetSortTimeMs(row.createdAt)
    case 'updatedAt':
      return targetSortTimeMs(row.updatedAt ?? row.createdAt)
    case 'startDate':
      return targetFilterDayStamp(row.startDate) ?? 0
    case 'endDate':
      return targetFilterDayStamp(row.endDate) ?? 0
    case 'status':
      return TARGET_STATUS_SORT_ORDER[row.status] ?? 0
    case 'priority': {
      const p = normalizeTaskPriority(row.priority)
      const idx = TASK_PRIORITY_LEVELS.indexOf(p)
      return idx >= 0 ? idx : 99
    }
    default:
      return 0
  }
}

function compareTargetsForSort(a: TargetRecord, b: TargetRecord, sortKey: TargetTableSortKey, completedAtIsoByKey: Record<string, string | undefined>): number {
  if (sortKey === 'custom') return 0
  if (sortKey === 'title' || sortKey === 'owner' || sortKey === 'createdBy') {
    const pick = (r: TargetRecord) => (sortKey === 'title' ? r.title : sortKey === 'owner' ? (r.owner ?? '') : (r.createdBy ?? ''))
    const c = pick(a).localeCompare(pick(b), 'zh-Hans-CN')
    if (c !== 0) return c
    return a.key.localeCompare(b.key)
  }
  const va = targetSortComparable(a, sortKey, completedAtIsoByKey)
  const vb = targetSortComparable(b, sortKey, completedAtIsoByKey)

  if (sortKey === 'status' || sortKey === 'priority') {
    const c = va - vb
    if (c !== 0) return c
    return a.key.localeCompare(b.key)
  }

  const c = vb - va
  if (c !== 0) return c
  return a.key.localeCompare(b.key)
}

export function sortTargetRecordsForTable(list: TargetRecord[], sortKey: TargetTableSortKey, completedAtIsoByKey: Record<string, string | undefined>): TargetRecord[] {
  if (sortKey === 'custom' || list.length <= 1) return list
  return [...list].sort((a, b) => compareTargetsForSort(a, b, sortKey, completedAtIsoByKey))
}
