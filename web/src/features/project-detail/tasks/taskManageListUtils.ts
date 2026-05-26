import { getTodaySortNumber, taskDateToSortNumber } from './taskDateUtils'
import type { TaskEditorSubtask, TaskManageRecord } from './taskTypes'

export const flattenTaskManageRows = (rows: TaskManageRecord[]): TaskManageRecord[] =>
  rows.flatMap(row => {
    if (row.kind === 'stage') return flattenTaskManageRows(row.children ?? [])
    return [row, ...flattenTaskManageRows(row.children ?? [])]
  })

/** 任务管理 / 搜索：按标题筛选，保留阶段树；父任务标题命中时保留其全部子任务 */
export const filterTaskManageListByTitleSearch = (rows: TaskManageRecord[], query: string): TaskManageRecord[] => {
  const needle = query.trim().toLowerCase()
  if (!needle) return rows

  const walk = (row: TaskManageRecord): TaskManageRecord | null => {
    if (row.kind === 'stage') {
      const nextChildren = (row.children ?? []).map(walk).filter((x): x is TaskManageRecord => Boolean(x))
      return nextChildren.length ? { ...row, children: nextChildren } : null
    }
    if (row.kind === 'task') {
      const nextChildren = (row.children ?? []).map(walk).filter((x): x is TaskManageRecord => Boolean(x))
      const selfMatch = row.title.toLowerCase().includes(needle)
      if (selfMatch) return { ...row, children: row.children ?? [] }
      if (nextChildren.length) return { ...row, children: nextChildren }
      return null
    }
    if (row.kind === 'subtask') {
      return row.title.toLowerCase().includes(needle) ? { ...row } : null
    }
    return null
  }

  return rows.map(walk).filter((x): x is TaskManageRecord => Boolean(x))
}

export function flattenTaskRowsForNoGroupView(rows: TaskManageRecord[]): TaskManageRecord[] {
  const out: TaskManageRecord[] = []
  for (const r of rows) {
    if (r.kind === 'stage') {
      for (const t of r.children ?? []) {
        if (t.kind === 'task') out.push(t)
      }
    } else if (r.kind === 'task') {
      out.push(r)
    }
  }
  return out
}

export const isTaskFinished = (task: Pick<TaskManageRecord, 'status'>) => task.status === '已完成' || task.status === '关闭'

export const isOverdueActiveTask = (task: Pick<TaskManageRecord, 'status' | 'end'>) =>
  taskDateToSortNumber(task.end) <= getTodaySortNumber() && !isTaskFinished(task)

/**
 * 项目概览「任务统计」口径：父任务下有子任务时只计子任务（避免与父任务重复计）；无子任务时计父任务本身。
 */
export const getTaskManageRowsForOverviewStats = (rows: TaskManageRecord[]): TaskManageRecord[] => {
  const out: TaskManageRecord[] = []
  for (const stage of rows) {
    if (stage.kind !== 'stage') continue
    for (const task of stage.children ?? []) {
      if (task.kind !== 'task') continue
      const subs = (task.children ?? []).filter(c => c.kind === 'subtask')
      if (subs.length > 0) out.push(...subs)
      else out.push(task)
    }
  }
  return out
}

/** 任务详情弹窗：父任务下的子任务列表 */
export function buildTaskEditorSubtasks(editingTask: TaskManageRecord | null, manageFlatTasks: TaskManageRecord[]): TaskEditorSubtask[] {
  if (!editingTask || editingTask.kind !== 'task') return []
  const latest = manageFlatTasks.find(x => x.key === editingTask.key) ?? editingTask
  const subs = (latest.children ?? []).filter(x => x.kind === 'subtask')
  return subs.map(sub => ({
    key: sub.key,
    id: sub.seq ?? 0,
    title: sub.title,
    end: sub.end,
    status: sub.status,
    owner: sub.owner ?? '—'
  }))
}
