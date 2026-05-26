import { TASK_PRIORITY_LEVELS, normalizeTaskPriority } from '../../ui/priorityWithMarks'
import type { TargetGroupMode } from './targetToolbarConfig'

export type TargetStatus = '未开始' | '进行中' | '验收中' | '已完成' | '关闭'

export type TargetRecordForGrouping = {
  key: string
  title: string
  status: TargetStatus
  type: string
  owner?: string
  priority?: '最高' | '较高' | '普通' | '较低' | '最低'
  meta: string
  createdBy?: string
}

export type TargetGroupTableRow = {
  key: string
  rowKind: 'group'
  title: string
  children: TargetRecordForGrouping[]
}

export type TargetTableRow = TargetRecordForGrouping | TargetGroupTableRow

export function isTargetGroupTableRow(row: TargetTableRow): row is TargetGroupTableRow {
  return 'rowKind' in row && row.rowKind === 'group'
}

const TARGET_TABLE_STATUS_ORDER: TargetStatus[] = ['未开始', '进行中', '验收中', '已完成', '关闭']

function mergeGroupKeyOrder(defaultOrdered: string[], labels: Set<string>, showEmpty: boolean): string[] {
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

function resolveTargetPriorityForGroup(record: Pick<TargetRecordForGrouping, 'priority' | 'meta'>): string {
  let raw: string | undefined = record.priority
  if (!raw?.trim() && record.meta?.trim()) {
    const m = record.meta.match(/^优先级:\s*(.+?)(?:\s{4}|$)/)
    if (m) raw = m[1].trim()
  }
  return normalizeTaskPriority(raw)
}

function orderedTargetGroupKeys(mode: TargetGroupMode, labels: Set<string>, showEmpty: boolean, typeFallback: string): string[] {
  if (mode === 'status') return mergeGroupKeyOrder([...TARGET_TABLE_STATUS_ORDER], labels, showEmpty)
  if (mode === 'priority') return mergeGroupKeyOrder([...TASK_PRIORITY_LEVELS], labels, showEmpty)
  if (mode === 'type') {
    const t = typeFallback.trim() || '未分类'
    const defaults = [t, '未分类'].filter((v, i, a) => a.indexOf(v) === i)
    return mergeGroupKeyOrder(defaults, labels, showEmpty)
  }
  if (mode === 'owner') return mergeGroupKeyOrder(['未分配'], labels, showEmpty)
  if (mode === 'createdBy') return mergeGroupKeyOrder(['未指定'], labels, showEmpty)
  return [...labels].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

function targetGroupBucketLabel(mode: TargetGroupMode, target: TargetRecordForGrouping, typeFallback: string): string {
  switch (mode) {
    case 'type':
      return (target.type ?? '').trim() || typeFallback.trim() || '未分类'
    case 'status':
      return target.status
    case 'priority':
      return resolveTargetPriorityForGroup(target)
    case 'owner':
      return (target.owner ?? '').trim() || '未分配'
    case 'createdBy':
      return (target.createdBy ?? '').trim() || '未指定'
    default:
      return ''
  }
}

/** 将已筛选/排序的扁平目标列表按维度重组为可展开的分组行 */
export function regroupTargetTableRows(
  targets: TargetRecordForGrouping[],
  mode: TargetGroupMode,
  showEmpty: boolean,
  typeFallback: string
): TargetGroupTableRow[] {
  if (mode === 'none' || mode === 'custom') return []
  const byLabel = new Map<string, TargetRecordForGrouping[]>()
  const labelSet = new Set<string>()
  for (const t of targets) {
    const lab = targetGroupBucketLabel(mode, t, typeFallback)
    labelSet.add(lab)
    const arr = byLabel.get(lab) ?? []
    arr.push(t)
    byLabel.set(lab, arr)
  }
  const order = orderedTargetGroupKeys(mode, labelSet, showEmpty, typeFallback)
  return order.map((label, idx) => ({
    key: `target-grp-${mode}-${idx}`,
    rowKind: 'group' as const,
    title: label,
    children: byLabel.get(label) ?? []
  }))
}

export function collectTargetGroupExpandKeys(rows: TargetGroupTableRow[]): string[] {
  return rows.filter(r => (r.children?.length ?? 0) > 0).map(r => r.key)
}
