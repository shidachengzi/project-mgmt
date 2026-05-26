const STORAGE_KEY = 'pm-calendar-reminder-rules-v1'

/** 与日程表单 reminders.channel 对齐：system | email | both */
export type CalendarReminderChannel = 'system' | 'email' | 'both'

export type CalendarReminderRule = {
  id: string
  minutesBefore: number
  channel: CalendarReminderChannel
}

export type CalendarEventReminderFormRow = {
  channel: string
  value: number
  unit: string
}

function loadAll(): Record<string, CalendarReminderRule[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== 'object' || Array.isArray(j)) return {}
    return j as Record<string, CalendarReminderRule[]>
  } catch {
    return {}
  }
}

function saveAll(map: Record<string, CalendarReminderRule[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

/** 新建日历或未配置时：系统消息、开始前 15 分钟 */
export function defaultRulesForCalendar(calendarId: string): CalendarReminderRule[] {
  return [{ id: `rule-${calendarId}-preset`, minutesBefore: 15, channel: 'system' }]
}

/** 将日历提醒设置转为「新建日程」表单用的 reminders 行（仅提前量，单位固定为分钟） */
export function eventRemindersFromCalendarSettings(calendarId: string): CalendarEventReminderFormRow[] {
  return loadReminderRules(calendarId).map(r => ({
    channel: r.channel,
    value: r.minutesBefore,
    unit: 'minutes',
  }))
}

export function loadReminderRules(calendarId: string): CalendarReminderRule[] {
  const map = loadAll()
  if (!(calendarId in map)) return defaultRulesForCalendar(calendarId)
  const list = map[calendarId]
  if (!Array.isArray(list)) return defaultRulesForCalendar(calendarId)
  return list
    .map((r, i) => {
      if (!r || typeof r !== 'object') return null
      const id = typeof r.id === 'string' ? r.id : `rule-${calendarId}-${i}`
      const minutesBefore =
        typeof r.minutesBefore === 'number' && Number.isFinite(r.minutesBefore) ? Math.max(1, Math.min(10080, Math.floor(r.minutesBefore))) : 15
      const ch = (r as { channel?: unknown }).channel
      let channel: CalendarReminderChannel = 'system'
      if (ch === 'email') channel = 'email'
      else if (ch === 'both') channel = 'both'
      return { id, minutesBefore, channel }
    })
    .filter((r): r is CalendarReminderRule => r != null)
}

export function persistReminderRules(calendarId: string, rules: CalendarReminderRule[]) {
  const map = loadAll()
  map[calendarId] = rules
  saveAll(map)
}

/** 新建日历后写入本地默认提醒，与「未在 storage 中」时的虚拟默认一致 */
export function ensureDefaultReminderRulesPersisted(calendarId: string) {
  const map = loadAll()
  if (calendarId in map) return
  map[calendarId] = defaultRulesForCalendar(calendarId)
  saveAll(map)
}

export function removeReminderRulesForCalendar(calendarId: string) {
  const map = loadAll()
  delete map[calendarId]
  saveAll(map)
}
