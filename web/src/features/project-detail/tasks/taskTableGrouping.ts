import { TASK_PRIORITY_LEVELS } from '../../../shared/ui/priorityWithMarks'
import { TASK_TABLE_STATUS_ORDER } from './taskTableSort'
import type { TaskGroupMode } from './taskToolbarConfig'
import type { TaskManageRecord } from './taskTypes'

function mergeTaskGroupKeyOrder(defaultOrdered: string[], labels: Set<string>, showEmpty: boolean): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const k of defaultOrdered) {
    if (labels.has(k) || showEmpty) {
      out.push(k)
      seen.add(k)
    }
  }
  for (const k of [...labels].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))) {
    if (!seen.has(k)) {
      out.push(k)
      seen.add(k)
    }
  }
  return out
}

function orderedTaskGroupKeys(
  mode: TaskGroupMode,
  labels: Set<string>,
  showEmpty: boolean,
  taskTypeLabel: string,
  canonicalStageTitles: string[]
): string[] {
  if (mode === 'stage') {
    const defaults = canonicalStageTitles.length ? canonicalStageTitles : ['未分类']
    return mergeTaskGroupKeyOrder(defaults, labels, showEmpty)
  }
  if (mode === 'status') return mergeTaskGroupKeyOrder([...TASK_TABLE_STATUS_ORDER], labels, showEmpty)
  if (mode === 'priority') return mergeTaskGroupKeyOrder([...TASK_PRIORITY_LEVELS], labels, showEmpty)
  if (mode === 'bizType') {
    const t = taskTypeLabel.trim() || '未分类'
    const defaults = [t, '未分类'].filter((v, i, a) => a.indexOf(v) === i)
    return mergeTaskGroupKeyOrder(defaults, labels, showEmpty)
  }
  if (mode === 'owner') return mergeTaskGroupKeyOrder(['未分配'], labels, showEmpty)
  if (mode === 'createdBy') return mergeTaskGroupKeyOrder(['未指定'], labels, showEmpty)
  return [...labels].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

function taskGroupBucketLabel(mode: TaskGroupMode, task: TaskManageRecord, taskTypeLabel: string, canonicalStageTitles: string[]): string {
  switch (mode) {
    case 'stage': {
      const raw = (task.stage ?? '').trim()
      if (!raw) return canonicalStageTitles[0] ?? '未分类'
      if (canonicalStageTitles.includes(raw)) return raw
      const base = raw.replace(/阶段$/, '')
      const byBase = canonicalStageTitles.find(s => s.replace(/阶段$/, '') === base)
      return byBase ?? raw
    }
    case 'bizType':
      return (task.bizLabel ?? '').trim() || taskTypeLabel.trim() || '未分类'
    case 'status':
      return task.status
    case 'priority':
      return task.priority
    case 'owner':
      return (task.owner ?? '').trim() || '未分配'
    case 'createdBy':
      return (task.createdBy ?? '').trim() || '未指定'
    default:
      return ''
  }
}

function collectTasksForRegroup(rows: TaskManageRecord[]): TaskManageRecord[] {
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

export function regroupTaskRows(
  rows: TaskManageRecord[],
  mode: TaskGroupMode,
  showEmpty: boolean,
  taskTypeLabel: string,
  canonicalStageTitles: string[]
): TaskManageRecord[] {
  if (mode === 'none') return rows
  const tasks = collectTasksForRegroup(rows)
  const byLabel = new Map<string, TaskManageRecord[]>()
  const labelSet = new Set<string>()
  for (const t of tasks) {
    const lab = taskGroupBucketLabel(mode, t, taskTypeLabel, canonicalStageTitles)
    labelSet.add(lab)
    const arr = byLabel.get(lab) ?? []
    arr.push(t)
    byLabel.set(lab, arr)
  }
  const order = orderedTaskGroupKeys(mode, labelSet, showEmpty, taskTypeLabel, canonicalStageTitles)
  return order.map((label, idx) => ({
    key: `grp-${mode}-${idx}`,
    kind: 'stage' as const,
    title: label,
    status: '未开始' as const,
    priority: '普通' as const,
    start: '',
    end: '',
    attachments: 0,
    progress: 0,
    children: byLabel.get(label) ?? []
  }))
}
