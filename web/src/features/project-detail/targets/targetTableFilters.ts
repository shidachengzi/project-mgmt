import dayjs from 'dayjs'
import { normalizeTaskPriority } from '../../../shared/ui/priorityWithMarks'
import type { TargetRecord, TargetStatus } from './targetTypes'

export type TargetTableFilterField =
  | 'status'
  | 'type'
  | 'owner'
  | 'participants'
  | 'title'
  | 'priority'
  | 'createdAt'
  | 'startDate'
  | 'endDate'
  | 'completedAt'

export type TargetTableFilterOp = 'eq' | 'neq' | 'contains' | 'not_contains' | 'before' | 'after' | 'date_eq'

export type TargetTableFilterCondition = {
  id: string
  field: TargetTableFilterField
  op: TargetTableFilterOp
  value: string
}

export const TARGET_TABLE_FILTER_OWNER_UNASSIGNED = '__UNASSIGNED__'

export const TARGET_TABLE_FILTER_FIELD_OPTIONS: { value: TargetTableFilterField; label: string }[] = [
  { value: 'status', label: '状态类型' },
  { value: 'type', label: '任务类型' },
  { value: 'owner', label: '负责人' },
  { value: 'participants', label: '参与人' },
  { value: 'title', label: '标题' },
  { value: 'priority', label: '优先级' },
  { value: 'createdAt', label: '创建时间' },
  { value: 'startDate', label: '开始时间' },
  { value: 'endDate', label: '截止时间' },
  { value: 'completedAt', label: '完成时间' }
]

export function newTargetTableFilterId(): string {
  return `tf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createDefaultTargetTableFilterRow(): TargetTableFilterCondition {
  return { id: newTargetTableFilterId(), field: 'status', op: 'eq', value: '' }
}

export function targetFilterRowHasValue(c: TargetTableFilterCondition): boolean {
  if (c.field === 'owner' && c.value === TARGET_TABLE_FILTER_OWNER_UNASSIGNED) return true
  return c.value.trim().length > 0
}

export function opsForTargetFilterField(field: TargetTableFilterField): { value: TargetTableFilterOp; label: string }[] {
  switch (field) {
    case 'title':
    case 'participants':
      return [
        { value: 'contains', label: '包含' },
        { value: 'not_contains', label: '不包含' }
      ]
    case 'createdAt':
    case 'startDate':
    case 'endDate':
    case 'completedAt':
      return [
        { value: 'before', label: '早于' },
        { value: 'after', label: '晚于' },
        { value: 'date_eq', label: '等于' }
      ]
    default:
      return [
        { value: 'eq', label: '等于' },
        { value: 'neq', label: '不等于' }
      ]
  }
}

export function defaultOpForTargetFilterField(field: TargetTableFilterField): TargetTableFilterOp {
  if (field === 'title' || field === 'participants') return 'contains'
  if (field === 'createdAt' || field === 'startDate' || field === 'endDate' || field === 'completedAt') return 'date_eq'
  return 'eq'
}

export function targetFilterDayStamp(iso?: string | null): number | null {
  if (!iso?.trim()) return null
  const d = dayjs(iso)
  if (!d.isValid()) return null
  return d.startOf('day').valueOf()
}

export function targetFilterDayStampFromYmd(ymd: string): number | null {
  const t = ymd.trim()
  if (!t) return null
  const d = dayjs(t, 'YYYY-MM-DD', true)
  if (!d.isValid()) return null
  return d.startOf('day').valueOf()
}

function matchesTargetTableFilterRow(row: TargetRecord, c: TargetTableFilterCondition, completedAtIsoByTargetKey?: Record<string, string | undefined>): boolean {
  const v = c.value
  switch (c.field) {
    case 'status': {
      const ok = row.status === (v as TargetStatus)
      return c.op === 'eq' ? ok : !ok
    }
    case 'type': {
      const ok = row.type === v
      return c.op === 'eq' ? ok : !ok
    }
    case 'owner': {
      const unassigned = !row.owner?.trim()
      if (v === TARGET_TABLE_FILTER_OWNER_UNASSIGNED) {
        return c.op === 'eq' ? unassigned : !unassigned
      }
      const ok = (row.owner ?? '') === v
      return c.op === 'eq' ? ok : !ok
    }
    case 'participants': {
      const parts = row.participants ?? []
      const needle = v.trim()
      if (!needle) return true
      const ok = parts.some(p => p === needle || p.includes(needle))
      return c.op === 'contains' ? ok : !ok
    }
    case 'title': {
      const hay = row.title.toLowerCase()
      const needle = v.trim().toLowerCase()
      const ok = needle.length > 0 && hay.includes(needle)
      return c.op === 'contains' ? ok : !ok
    }
    case 'priority': {
      const pv = normalizeTaskPriority(row.priority)
      const fv = normalizeTaskPriority(v)
      const ok = pv === fv
      return c.op === 'eq' ? ok : !ok
    }
    case 'createdAt':
    case 'startDate':
    case 'endDate': {
      const rowIso = c.field === 'createdAt' ? row.createdAt : c.field === 'startDate' ? row.startDate : row.endDate
      const rowTs = targetFilterDayStamp(rowIso)
      const filterTs = targetFilterDayStampFromYmd(v)
      if (filterTs == null) return true
      if (rowTs == null) return false
      if (c.op === 'date_eq') return rowTs === filterTs
      if (c.op === 'before') return rowTs < filterTs
      if (c.op === 'after') return rowTs > filterTs
      return true
    }
    case 'completedAt': {
      const filterTs = targetFilterDayStampFromYmd(v)
      if (filterTs == null) return true
      if (row.status !== '已完成' && row.status !== '关闭') return false
      const completedIso = completedAtIsoByTargetKey?.[row.key]
      const rowTs = targetFilterDayStamp(completedIso)
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

export function applyTargetTableFilterConditions(
  rows: TargetRecord[],
  conditions: TargetTableFilterCondition[],
  completedAtIsoByTargetKey?: Record<string, string | undefined>
): TargetRecord[] {
  const active = conditions.filter(targetFilterRowHasValue)
  if (!active.length) return rows
  return rows.filter(row => active.every(c => matchesTargetTableFilterRow(row, c, completedAtIsoByTargetKey)))
}
