import type { CalendarDTO } from '../api/calendarApi'

export const CALENDAR_LIST_STORAGE_KEY = 'pm-calendar-lists-v1'

export const CALENDAR_COLORS = [
  '#4ea1f2',
  '#56bdf2',
  '#4cccd9',
  '#3dcdb3',
  '#3dc6a0',
  '#9dd765',
  '#74ce6a',
  '#67c98b',
  '#e9c95c',
  '#f0c24e',
  '#f29661',
  '#f48682',
  '#f06f90',
  '#e874b2',
  '#db7ed0',
  '#bc78e2',
  '#8d73de',
  '#7880e8',
]

/** 非所有者成员在日历上的权限 */
export type CalendarMemberPermission = 'editor' | 'viewer'

export type CustomCalendar = {
  id: string
  name: string
  color: string
  visibility: 'private' | 'team'
  memberIds: string[]
  ownerUserId?: string
  /** 仅非 owner：editor 可增改删日程；viewer 只读 */
  memberAccess?: Record<string, CalendarMemberPermission>
}

export function buildMemberAccessForMembers(
  ownerUserId: string | undefined,
  memberIds: string[],
  incoming?: Record<string, CalendarMemberPermission> | null,
): Record<string, CalendarMemberPermission> {
  const out: Record<string, CalendarMemberPermission> = {}
  for (const id of memberIds) {
    if (ownerUserId && id === ownerUserId) continue
    out[id] = incoming?.[id] === 'viewer' ? 'viewer' : 'editor'
  }
  return out
}

/**
 * 无 ownerUserId 时（历史本地数据）：成员列表内非 viewer 视为可管理日程与设置；
 * 有 ownerUserId 时：仅 owner 为管理，其余为 editor/viewer。
 */
export function getUserCalendarRole(cal: CustomCalendar, userId: string | null): 'admin' | 'editor' | 'viewer' | 'none' {
  if (!userId) return 'none'
  if (cal.ownerUserId) {
    if (userId === cal.ownerUserId) return 'admin'
    if (cal.visibility === 'team' && !cal.memberIds.includes(userId)) {
      return 'viewer'
    }
    if (!cal.memberIds.includes(userId)) return 'none'
    return cal.memberAccess?.[userId] === 'viewer' ? 'viewer' : 'editor'
  }
  if (cal.visibility === 'team' && !cal.memberIds.includes(userId)) return 'viewer'
  if (!cal.memberIds.includes(userId)) return 'none'
  return cal.memberAccess?.[userId] === 'viewer' ? 'viewer' : 'admin'
}

export function canUserEditCalendarEvents(cal: CustomCalendar | undefined, userId: string | null): boolean {
  if (!cal || !userId) return false
  const r = getUserCalendarRole(cal, userId)
  return r === 'admin' || r === 'editor'
}

export function calendarDtoToCustom(d: CalendarDTO): CustomCalendar {
  return {
    id: d.id,
    name: d.name,
    color: d.color,
    visibility: d.visibility,
    memberIds: d.memberIds,
    ownerUserId: d.ownerUserId,
    memberAccess: buildMemberAccessForMembers(d.ownerUserId, d.memberIds, d.memberAccess ?? undefined),
  }
}

export function readCustomCalendarsFromStorage(): CustomCalendar[] {
  try {
    const raw = localStorage.getItem(CALENDAR_LIST_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const mapped = parsed
      .map((item, index): CustomCalendar | null => {
        if (typeof item === 'string' && item.trim()) {
          return {
            id: `legacy-${index}-${item}`,
            name: item.trim(),
            color: CALENDAR_COLORS[index % CALENDAR_COLORS.length],
            visibility: 'private',
            memberIds: [] as string[],
            memberAccess: {},
          } satisfies CustomCalendar
        }
        if (!item || typeof item !== 'object') return null
        const candidate = item as Partial<CustomCalendar>
        if (!candidate.name || typeof candidate.name !== 'string') return null
        const ownerUserId = typeof candidate.ownerUserId === 'string' ? candidate.ownerUserId : undefined
        const memberIds = Array.isArray(candidate.memberIds) ? candidate.memberIds.filter(id => typeof id === 'string') : []
        const rawAccess = candidate.memberAccess && typeof candidate.memberAccess === 'object' && !Array.isArray(candidate.memberAccess) ? (candidate.memberAccess as Record<string, CalendarMemberPermission>) : undefined
        const calendar: CustomCalendar = {
          id: typeof candidate.id === 'string' ? candidate.id : `custom-${index}-${candidate.name}`,
          name: candidate.name.trim(),
          color: typeof candidate.color === 'string' ? candidate.color : CALENDAR_COLORS[index % CALENDAR_COLORS.length],
          visibility: candidate.visibility === 'team' ? 'team' : 'private',
          memberIds,
          memberAccess: buildMemberAccessForMembers(ownerUserId, memberIds, rawAccess),
        }
        if (ownerUserId !== undefined) calendar.ownerUserId = ownerUserId
        return calendar
      })
    return mapped.filter((item): item is CustomCalendar => item != null)
  } catch {
    return []
  }
}

export function persistCustomCalendarsLocal(list: CustomCalendar[]): void {
  localStorage.setItem(CALENDAR_LIST_STORAGE_KEY, JSON.stringify(list))
}
