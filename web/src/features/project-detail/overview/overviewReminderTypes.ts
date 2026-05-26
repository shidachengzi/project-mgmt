export type ProjectOverviewReminderOffsetUnit = 'minutes' | 'hours' | 'days'

export type ProjectOverviewReminderRow = {
  id: string
  anchorTime: 'start' | 'end'
  offsetSide: 'before' | 'after'
  offsetValue: number
  offsetUnit: ProjectOverviewReminderOffsetUnit
  channel: 'system' | 'email' | 'both'
  remindAt: string
}
