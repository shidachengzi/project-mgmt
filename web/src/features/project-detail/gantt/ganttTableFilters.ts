import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { normalizeTaskPriority } from '../../../shared/ui/priorityWithMarks'
import {
  GANTT_FILTER_OWNER_UNASSIGNED,
  ganttFilterRowHasValue,
  type GanttTableFilterCondition,
  type GanttTableSortKey
} from './ganttToolbarConfig'
import type { GanttRowData } from './useProjectGanttData'

export { ganttFilterRowHasValue }

const STATUS_ORDER = ['未开始', '进行中', '搁置中', '已完成', '关闭'] as const
const PRIORITY_ORDER = ['最高', '较高', '普通', '较低', '最低'] as const

export function ganttDayStamp(d: Dayjs): number {
  return d.year() * 10000 + (d.month() + 1) * 100 + d.date()
}

function ganttYmdToDayStamp(ymd: string): number | null {
  const d = dayjs(ymd, 'YYYY-MM-DD', true)
  return d.isValid() ? ganttDayStamp(d) : null
}

function ganttCreatedDayStamp(iso?: string | null): number | null {
  if (!iso?.trim()) return null
  const d = dayjs(iso)
  if (!d.isValid()) return null
  return ganttDayStamp(d.startOf('day'))
}

function matchesGanttFilterRow(row: GanttRowData, c: GanttTableFilterCondition): boolean {
  switch (c.field) {
    case 'status': {
      const ok = row.status === c.value
      return c.op === 'eq' ? ok : !ok
    }
    case 'priority': {
      const pv = normalizeTaskPriority(row.priority)
      const fv = normalizeTaskPriority(c.value)
      const ok = pv === fv
      return c.op === 'eq' ? ok : !ok
    }
    case 'owner': {
      const unassigned = !row.owner?.trim()
      if (c.value === GANTT_FILTER_OWNER_UNASSIGNED) {
        return c.op === 'eq' ? unassigned : !unassigned
      }
      const ok = (row.owner ?? '') === c.value
      return c.op === 'eq' ? ok : !ok
    }
    case 'createdBy': {
      const empty = !(row.createdBy ?? '').trim()
      if (c.value === '未指定') {
        return c.op === 'eq' ? empty : !empty
      }
      const ok = (row.createdBy ?? '').trim() === c.value.trim()
      return c.op === 'eq' ? ok : !ok
    }
    case 'stage': {
      const ok = (row.stageTitle ?? '').trim() === c.value.trim()
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
      const filterN = ganttYmdToDayStamp(c.value)
      if (filterN == null) return true
      const rowN = ganttDayStamp(c.field === 'start' ? row.startDate : row.endDate)
      if (c.op === 'date_eq') return rowN === filterN
      if (c.op === 'before') return rowN < filterN
      if (c.op === 'after') return rowN > filterN
      return true
    }
    case 'createdAt': {
      const filterTs = ganttYmdToDayStamp(c.value)
      if (filterTs == null) return true
      const rowTs = ganttCreatedDayStamp(row.createdAt)
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

export function applyGanttFilters(rows: GanttRowData[], conditions: GanttTableFilterCondition[]): GanttRowData[] {
  const active = conditions.filter(ganttFilterRowHasValue)
  if (!active.length) return rows
  return rows.filter(row => active.every(c => matchesGanttFilterRow(row, c)))
}

function compareGanttForSort(a: GanttRowData, b: GanttRowData, sortKey: GanttTableSortKey): number {
  if (sortKey === 'custom') return 0
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
      const ia = STATUS_ORDER.indexOf(a.status as (typeof STATUS_ORDER)[number])
      const ib = STATUS_ORDER.indexOf(b.status as (typeof STATUS_ORDER)[number])
      const va = ia >= 0 ? ia : 99
      const vb = ib >= 0 ? ib : 99
      const d = va - vb
      return d !== 0 ? d : a.key.localeCompare(b.key)
    }
    case 'priority': {
      const ia = PRIORITY_ORDER.indexOf(a.priority as (typeof PRIORITY_ORDER)[number])
      const ib = PRIORITY_ORDER.indexOf(b.priority as (typeof PRIORITY_ORDER)[number])
      const va = ia >= 0 ? ia : 99
      const vb = ib >= 0 ? ib : 99
      const d = va - vb
      return d !== 0 ? d : a.key.localeCompare(b.key)
    }
    case 'start': {
      const va = a.startDate.valueOf()
      const vb = b.startDate.valueOf()
      const d = vb - va
      return d !== 0 ? d : a.key.localeCompare(b.key)
    }
    case 'end': {
      const va = a.endDate.valueOf()
      const vb = b.endDate.valueOf()
      const d = vb - va
      return d !== 0 ? d : a.key.localeCompare(b.key)
    }
    case 'createdAt': {
      const va = dayjs(a.createdAt).valueOf()
      const vb = dayjs(b.createdAt).valueOf()
      const aa = Number.isFinite(va) ? va : 0
      const bb = Number.isFinite(vb) ? vb : 0
      const d = bb - aa
      return d !== 0 ? d : a.key.localeCompare(b.key)
    }
    default:
      return 0
  }
}

export function sortGanttHierarchy(rows: GanttRowData[], sortKey: GanttTableSortKey): GanttRowData[] {
  if (sortKey === 'custom' || rows.length <= 1) return rows
  const rowByKey = new Map(rows.map(r => [r.key, r]))
  const cmp = (a: GanttRowData, b: GanttRowData) => compareGanttForSort(a, b, sortKey)
  const byParent = new Map<string | null, GanttRowData[]>()
  for (const r of rows) {
    const p = r.parentKey && rowByKey.has(r.parentKey) ? r.parentKey : null
    const list = byParent.get(p) ?? []
    list.push(r)
    byParent.set(p, list)
  }
  const walk = (parentKey: string | null): GanttRowData[] => {
    const children = byParent.get(parentKey) ?? []
    const sorted = [...children].sort(cmp)
    const out: GanttRowData[] = []
    for (const row of sorted) {
      out.push(row)
      out.push(...walk(row.key))
    }
    return out
  }
  return walk(null)
}

export const GANTT_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = STATUS_ORDER.map(s => ({ value: s, label: s }))
