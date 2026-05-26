import type { ProjectOverviewReminderOffsetUnit, ProjectOverviewReminderRow } from './overviewReminderTypes'

export function parseProjectOverviewReminderRows(raw: unknown): ProjectOverviewReminderRow[] {
  if (!Array.isArray(raw)) return []
  const units = new Set<ProjectOverviewReminderOffsetUnit>(['minutes', 'hours', 'days'])
  return raw
    .map((item): ProjectOverviewReminderRow | null => {
      if (!item || typeof item !== 'object') return null
      const o = item as Record<string, unknown>
      const id = typeof o.id === 'string' && o.id ? o.id : null
      const anchorTime = o.anchorTime === 'end' ? 'end' : 'start'
      const offsetSide = o.offsetSide === 'after' ? 'after' : 'before'
      const offsetValue = typeof o.offsetValue === 'number' && Number.isFinite(o.offsetValue) && o.offsetValue >= 0 ? Math.floor(o.offsetValue) : 0
      const u = o.offsetUnit
      const offsetUnit = units.has(u as ProjectOverviewReminderOffsetUnit) ? (u as ProjectOverviewReminderOffsetUnit) : 'days'
      const ch = o.channel
      let channel: ProjectOverviewReminderRow['channel'] = 'system'
      if (ch === 'email') channel = 'email'
      else if (ch === 'both') channel = 'both'
      const remindAt = typeof o.remindAt === 'string' && /^\d{1,2}:\d{2}$/.test(o.remindAt) ? o.remindAt : '09:00'
      if (!id) return null
      return { id, anchorTime, offsetSide, offsetValue, offsetUnit, channel, remindAt }
    })
    .filter((x): x is ProjectOverviewReminderRow => x !== null)
}
