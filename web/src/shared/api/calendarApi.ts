import dayjs from 'dayjs'
import type { CalendarMemberPermission } from '../calendar/customCalendar'
import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type { CalendarMemberPermission } from '../calendar/customCalendar'

export type CalendarDTO = {
  id: string
  ownerUserId: string
  name: string
  color: string
  visibility: 'private' | 'team'
  memberIds: string[]
  /** 非所有者成员权限；缺省为 editor */
  memberAccess?: Record<string, CalendarMemberPermission>
  createdAt: string
  updatedAt: string
}

export type CalendarEventDTO = {
  id: string
  title: string
  startAt: string
  endAt: string
  allDay: boolean
  hexColor: string | null
  calendarId: string
  ownerId: string
  participantIds: string[]
  repeatRule: string | null
  location: string | null
  description: string | null
  reminders: { channel: string; value: number; unit: string }[] | null
}

export type CalendarEventClient = {
  id: string
  title: string
  date: string
  time?: string
  startHour?: number
  endHour?: number
  startAt?: string
  endAt?: string
  allDay?: boolean
  hexColor?: string
  calendarId?: string
  ownerId?: string
  participantIds?: string[]
  repeatRule?: string
  location?: string
  description?: string
  reminders?: { channel: string; value: number; unit: string }[]
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export function calendarEventDtoToClient(d: CalendarEventDTO): CalendarEventClient {
  const start = dayjs(d.startAt)
  const end = dayjs(d.endAt)
  return {
    id: d.id,
    title: d.title,
    date: start.format('YYYY-MM-DD'),
    time: d.allDay ? undefined : start.format('HH:mm'),
    startAt: d.startAt,
    endAt: d.endAt,
    allDay: d.allDay,
    startHour: start.hour(),
    endHour: end.hour(),
    hexColor: d.hexColor ?? undefined,
    calendarId: d.calendarId,
    ownerId: d.ownerId,
    participantIds: d.participantIds,
    repeatRule: d.repeatRule ?? undefined,
    location: d.location ?? undefined,
    description: d.description ?? undefined,
    reminders: d.reminders ?? undefined,
  }
}

/** 工作台日程卡片 */
export type CalendarScheduleItem = {
  id: string
  title: string
  date: string
  time: string
  ownerId?: string
}

export function calendarEventDtoToScheduleItem(d: CalendarEventDTO): CalendarScheduleItem {
  const ev = calendarEventDtoToClient(d)
  const titleText = ev.title
  const titleWithoutTime = titleText.replace(/^\d{1,2}:\d{2}\s*/, '').trim()
  return {
    id: ev.id,
    title: titleWithoutTime || titleText,
    date: ev.date,
    time: ev.time && ev.time.trim() ? ev.time : '--:--',
    ownerId: ev.ownerId,
  }
}

export async function fetchCalendars(): Promise<{ ok: true; data: CalendarDTO[] } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/calendars')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<CalendarDTO[]>(res)
}

export async function postCalendar(body: {
  name: string
  color: string
  visibility: 'private' | 'team'
  memberIds: string[]
  memberAccess?: Record<string, CalendarMemberPermission>
}): Promise<{ ok: true; data: CalendarDTO } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/calendars')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<CalendarDTO>(res)
}

export async function patchCalendar(
  calendarId: string,
  body: {
    name?: string
    color?: string
    visibility?: 'private' | 'team'
    memberIds?: string[]
    memberAccess?: Record<string, CalendarMemberPermission>
  },
): Promise<{ ok: true; data: CalendarDTO } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/calendars/${encodeURIComponent(calendarId)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<CalendarDTO>(res)
}

export async function deleteCalendar(
  calendarId: string,
): Promise<{ ok: true; data: { deleted: true } } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/calendars/${encodeURIComponent(calendarId)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { method: 'DELETE', credentials: 'include' })
  return parseJson<{ deleted: true }>(res)
}

export async function fetchCalendarEvents(params: {
  from: string
  to: string
}): Promise<{ ok: true; data: CalendarEventDTO[] } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/calendar-events?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<CalendarEventDTO[]>(res)
}

export async function postCalendarEvent(body: {
  calendarId: string
  title: string
  startAt: string
  endAt: string
  allDay?: boolean
  repeatRule?: string | null
  participantIds: string[]
  location?: string | null
  description?: string | null
  reminders?: { channel: string; value: number; unit: string }[] | null
}): Promise<{ ok: true; data: CalendarEventDTO } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/calendar-events')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<CalendarEventDTO>(res)
}

export async function patchCalendarEvent(
  eventId: string,
  body: {
    title: string
    startAt: string
    endAt: string
    allDay?: boolean
    repeatRule?: string | null
    participantIds: string[]
    location?: string | null
    description?: string | null
    reminders?: { channel: string; value: number; unit: string }[] | null
  },
): Promise<{ ok: true; data: CalendarEventDTO } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/calendar-events/${encodeURIComponent(eventId)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<CalendarEventDTO>(res)
}

export async function deleteCalendarEvent(
  eventId: string,
): Promise<{ ok: true; data: { deleted: true } } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/calendar-events/${encodeURIComponent(eventId)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { method: 'DELETE', credentials: 'include' })
  return parseJson<{ deleted: true }>(res)
}
