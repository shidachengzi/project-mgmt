import dayjs from 'dayjs'
import { normalizeTaskPriority } from '../../../shared/ui/priorityWithMarks'
import type { TargetRecord } from './targetTypes'

export function resolveTargetPriority(record: Pick<TargetRecord, 'priority' | 'meta'>): TargetRecord['priority'] {
  let raw: string | undefined = record.priority
  if (!raw?.trim() && record.meta?.trim()) {
    const m = record.meta.match(/^优先级:\s*(.+?)(?:\s{4}|$)/)
    if (m) raw = m[1].trim()
  }
  return normalizeTaskPriority(raw)
}

/** 列表「其他信息」与写入 payload 的 meta：由优先级、更新时间字段生成 */
export const buildTargetOtherInfoParts = (record: Pick<TargetRecord, 'priority' | 'updatedAt' | 'createdAt' | 'meta'>) => {
  const p = resolveTargetPriority(record)
  const timeIso = record.updatedAt || record.createdAt
  let timePart: string
  if (timeIso && dayjs(timeIso).isValid()) {
    timePart = `更新时间 ${dayjs(timeIso).format('M月D日 HH:mm')}`
  } else if (record.meta?.includes('更新时间')) {
    const tm = record.meta.match(/更新时间\s+(.+)$/)
    timePart = tm ? `更新时间 ${tm[1].trim()}` : '更新时间 —'
  } else {
    timePart = '更新时间 —'
  }
  return { priorityPart: `优先级: ${p}`, timePart }
}

export const buildTargetMetaString = (record: Pick<TargetRecord, 'priority' | 'updatedAt' | 'createdAt' | 'meta'>) => {
  const { priorityPart, timePart } = buildTargetOtherInfoParts(record)
  return `${priorityPart}    ${timePart}`
}

export const formatAuditZh = (iso?: string) => (iso && dayjs(iso).isValid() ? dayjs(iso).format('YYYY年M月D日 HH:mm') : '—')
