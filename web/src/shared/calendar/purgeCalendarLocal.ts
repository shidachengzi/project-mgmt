import { persistCustomCalendarsLocal, readCustomCalendarsFromStorage } from './customCalendar'
import { removeReminderRulesForCalendar } from './calendarReminderStorage'

const FAVORITES_KEY = 'pm-calendar-favorites-v1'
const EVENTS_KEY = 'pm-calendar-events-v1'

/** 从 localStorage 移除该日历及关联的本地日程、收藏、提醒规则 */
export function purgeCalendarFromLocalStorage(calendarId: string) {
  const cals = readCustomCalendarsFromStorage().filter(c => c.id !== calendarId)
  persistCustomCalendarsLocal(cals)
  removeReminderRulesForCalendar(calendarId)

  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (raw) {
      const ids = JSON.parse(raw) as unknown
      if (Array.isArray(ids)) {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids.filter((id): id is string => typeof id === 'string' && id !== calendarId)))
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const raw = localStorage.getItem(EVENTS_KEY)
    if (!raw) {
      window.dispatchEvent(new Event('pm-calendar-updated'))
      return
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return
    const next = parsed.filter((item: unknown) => {
      if (!item || typeof item !== 'object') return true
      const calId = (item as { calendarId?: string }).calendarId
      return calId !== calendarId
    })
    localStorage.setItem(EVENTS_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event('storage'))
    window.dispatchEvent(new Event('pm-calendar-updated'))
  } catch {
    /* ignore */
  }
}
