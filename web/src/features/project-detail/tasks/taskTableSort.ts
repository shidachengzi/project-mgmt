import { normalizeTaskPriority, TASK_PRIORITY_LEVELS } from '../../../shared/ui/priorityWithMarks'
import { targetSortTimeMs } from '../targets/targetTableSort'
import { taskDateToSortNumber } from './taskDateUtils'
import type { TaskTableSortKey } from './taskToolbarConfig'
import type { TaskManageRecord } from './taskTypes'

export const TASK_TABLE_STATUS_ORDER: TaskManageRecord['status'][] = ['未开始', '进行中', '搁置中', '已完成', '关闭']

const TASK_STATUS_SORT_INDEX: Record<TaskManageRecord['status'], number> = {
  未开始: 0,
  进行中: 1,
  搁置中: 2,
  已完成: 3,
  关闭: 4
}

function compareTasksForSort(
  a: TaskManageRecord,
  b: TaskManageRecord,
  sortKey: TaskTableSortKey,
  taskCompletedAtIsoByKey: Record<string, string | undefined>
): number {
  if (sortKey === 'custom' || a.kind === 'stage' || b.kind === 'stage') return 0
  switch (sortKey) {
    case 'title': {
      const c = a.title.localeCompare(b.title, 'zh-Hans-CN')
      return c !== 0 ? c : a.key.localeCompare(b.key)
    }
    case 'owner': {
      const c = (a.owner ?? '').localeCompare(b.owner ?? '', 'zh-Hans-CN')
      return c !== 0 ? c : a.key.localeCompare(b.key)
    }
    case 'createdBy': {
      const c = (a.createdBy ?? '').localeCompare(b.createdBy ?? '', 'zh-Hans-CN')
      return c !== 0 ? c : a.key.localeCompare(b.key)
    }
    case 'status': {
      const va = TASK_STATUS_SORT_INDEX[a.status] ?? 0
      const vb = TASK_STATUS_SORT_INDEX[b.status] ?? 0
      const d = va - vb
      return d !== 0 ? d : a.key.localeCompare(b.key)
    }
    case 'priority': {
      const ia = TASK_PRIORITY_LEVELS.indexOf(normalizeTaskPriority(a.priority))
      const ib = TASK_PRIORITY_LEVELS.indexOf(normalizeTaskPriority(b.priority))
      const d = (ia >= 0 ? ia : 99) - (ib >= 0 ? ib : 99)
      return d !== 0 ? d : a.key.localeCompare(b.key)
    }
    case 'start':
    case 'end': {
      const va = taskDateToSortNumber(sortKey === 'start' ? a.start : a.end)
      const vb = taskDateToSortNumber(sortKey === 'start' ? b.start : b.end)
      const d = vb - va
      return d !== 0 ? d : a.key.localeCompare(b.key)
    }
    case 'completedAt': {
      const va = targetSortTimeMs(taskCompletedAtIsoByKey[a.key])
      const vb = targetSortTimeMs(taskCompletedAtIsoByKey[b.key])
      const d = vb - va
      return d !== 0 ? d : a.key.localeCompare(b.key)
    }
    case 'createdAt':
    case 'updatedAt': {
      const va = targetSortTimeMs(sortKey === 'createdAt' ? a.createdAt : (a.updatedAt ?? a.createdAt))
      const vb = targetSortTimeMs(sortKey === 'createdAt' ? b.createdAt : (b.updatedAt ?? b.createdAt))
      const d = vb - va
      return d !== 0 ? d : a.key.localeCompare(b.key)
    }
    default:
      return 0
  }
}

function sortTaskChildrenLevel(
  children: TaskManageRecord[],
  sortKey: TaskTableSortKey,
  taskCompletedAtIsoByKey: Record<string, string | undefined>
): TaskManageRecord[] {
  if (sortKey === 'custom' || !children.length) {
    return children.map(ch => (ch.children?.length ? { ...ch, children: sortTaskChildrenLevel(ch.children, sortKey, taskCompletedAtIsoByKey) } : ch))
  }
  const sorted = [...children].sort((a, b) => compareTasksForSort(a, b, sortKey, taskCompletedAtIsoByKey))
  return sorted.map(ch => (ch.children?.length ? { ...ch, children: sortTaskChildrenLevel(ch.children, sortKey, taskCompletedAtIsoByKey) } : ch))
}

export function sortTaskForest(
  rows: TaskManageRecord[],
  sortKey: TaskTableSortKey,
  taskCompletedAtIsoByKey: Record<string, string | undefined>
): TaskManageRecord[] {
  if (sortKey === 'custom') return rows
  if (rows.some(r => r.kind === 'stage')) {
    return rows.map(row => {
      if (row.kind !== 'stage') return row
      return { ...row, children: sortTaskChildrenLevel(row.children ?? [], sortKey, taskCompletedAtIsoByKey) }
    })
  }
  return sortTaskChildrenLevel(rows, sortKey, taskCompletedAtIsoByKey)
}
