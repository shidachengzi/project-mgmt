import { normalizeTaskPriority } from '../../../shared/ui/priorityWithMarks'
import {
  TARGET_TABLE_FILTER_OWNER_UNASSIGNED,
  targetFilterDayStamp,
  targetFilterDayStampFromYmd
} from '../targets/targetTableFilters'
import { taskDateToSortNumber } from './taskDateUtils'
import type { TaskManageTableFilterCondition } from './taskToolbarConfig'
import type { TaskManageRecord } from './taskTypes'

export const TASK_MANAGE_STATUS_FILTER_OPTIONS: { value: TaskManageRecord['status']; label: string }[] = [
  { value: '未开始', label: '未开始' },
  { value: '进行中', label: '进行中' },
  { value: '搁置中', label: '搁置中' },
  { value: '已完成', label: '已完成' },
  { value: '关闭', label: '关闭' }
]

export function newTaskManageTableFilterId(): string {
  return `qf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function taskManageTableFilterRowHasValue(c: TaskManageTableFilterCondition): boolean {
  if (c.field === 'owner' && c.value === TARGET_TABLE_FILTER_OWNER_UNASSIGNED) return true
  return c.value.trim().length > 0
}

function matchesTaskManageTableFilterRow(
  row: TaskManageRecord,
  c: TaskManageTableFilterCondition,
  taskTypeLabel: string,
  taskCompletedAtIsoByKey: Record<string, string | undefined>
): boolean {
  if (row.kind === 'stage') return true
  switch (c.field) {
    case 'status': {
      const ok = row.status === (c.value as TaskManageRecord['status'])
      return c.op === 'eq' ? ok : !ok
    }
    case 'bizType': {
      const rowType = (row.bizLabel ?? '').trim() || taskTypeLabel.trim() || '未分类'
      const ok = rowType === c.value.trim()
      return c.op === 'eq' ? ok : !ok
    }
    case 'owner': {
      const unassigned = !row.owner?.trim()
      if (c.value === TARGET_TABLE_FILTER_OWNER_UNASSIGNED) {
        return c.op === 'eq' ? unassigned : !unassigned
      }
      const ok = (row.owner ?? '') === c.value
      return c.op === 'eq' ? ok : !ok
    }
    case 'createdBy': {
      const unassigned = !(row.createdBy ?? '').trim()
      if (c.value === '未指定') {
        return c.op === 'eq' ? unassigned : !unassigned
      }
      const ok = (row.createdBy ?? '').trim() === c.value.trim()
      return c.op === 'eq' ? ok : !ok
    }
    case 'priority': {
      const pv = normalizeTaskPriority(row.priority)
      const fv = normalizeTaskPriority(c.value)
      const ok = pv === fv
      return c.op === 'eq' ? ok : !ok
    }
    case 'stage': {
      const st = (row.stage ?? '').trim()
      const v = c.value.trim()
      const ok = st === v
      return c.op === 'eq' ? ok : !ok
    }
    case 'title': {
      const needle = c.value.trim().toLowerCase()
      if (!needle) return true
      const ok = row.title.toLowerCase().includes(needle)
      return c.op === 'contains' ? ok : !ok
    }
    case 'start':
    case 'end': {
      const filterN = taskDateToSortNumber(c.value)
      if (filterN === Number.POSITIVE_INFINITY) return true
      const rowN = taskDateToSortNumber(c.field === 'start' ? row.start : row.end)
      if (rowN === Number.POSITIVE_INFINITY) return false
      if (c.op === 'date_eq') return rowN === filterN
      if (c.op === 'before') return rowN < filterN
      if (c.op === 'after') return rowN > filterN
      return true
    }
    case 'createdAt':
    case 'updatedAt': {
      const filterTs = targetFilterDayStampFromYmd(c.value)
      if (filterTs == null) return true
      const rowTs = targetFilterDayStamp(c.field === 'createdAt' ? row.createdAt : (row.updatedAt ?? row.createdAt))
      if (rowTs == null) return false
      if (c.op === 'date_eq') return rowTs === filterTs
      if (c.op === 'before') return rowTs < filterTs
      if (c.op === 'after') return rowTs > filterTs
      return true
    }
    case 'completedAt': {
      const filterTs = targetFilterDayStampFromYmd(c.value)
      if (filterTs == null) return true
      if (row.status !== '已完成' && row.status !== '关闭') return false
      const rowTs = targetFilterDayStamp(taskCompletedAtIsoByKey[row.key])
      if (rowTs == null) return false
      if (c.op === 'date_eq') return rowTs === filterTs
      if (c.op === 'before') return rowTs < filterTs
      if (c.op === 'after') return rowTs > filterTs
      return true
    }
    default:
      return true
  }
}

export function applyTaskManageTableFilterConditions(
  rows: TaskManageRecord[],
  conditions: TaskManageTableFilterCondition[],
  taskTypeLabel: string,
  taskCompletedAtIsoByKey: Record<string, string | undefined>
): TaskManageRecord[] {
  const active = conditions.filter(taskManageTableFilterRowHasValue)
  if (!active.length) return rows
  const rowMatches = (row: TaskManageRecord) => active.every(c => matchesTaskManageTableFilterRow(row, c, taskTypeLabel, taskCompletedAtIsoByKey))

  const walk = (row: TaskManageRecord): TaskManageRecord | null => {
    if (row.kind === 'stage') {
      const nextChildren = (row.children ?? []).map(walk).filter((x): x is TaskManageRecord => Boolean(x))
      return nextChildren.length ? { ...row, children: nextChildren } : null
    }
    if (row.kind === 'task') {
      const kids = row.children ?? []
      const nextChildren = kids.map(walk).filter((x): x is TaskManageRecord => Boolean(x))
      const selfOk = rowMatches(row)
      if (selfOk) {
        if (!kids.length) return { ...row }
        return { ...row, children: nextChildren }
      }
      if (nextChildren.length) return { ...row, children: nextChildren }
      return null
    }
    if (row.kind === 'subtask') {
      return rowMatches(row) ? { ...row } : null
    }
    return null
  }

  return rows.map(walk).filter((x): x is TaskManageRecord => Boolean(x))
}
