import { CheckOutlined, ClockCircleOutlined, EditOutlined, LeftOutlined, MoreOutlined, PlusOutlined, RightOutlined, SettingOutlined, StarFilled, StarOutlined, UnorderedListOutlined, UserAddOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Checkbox, DatePicker, Dropdown, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Spin, Typography, message } from 'antd'
import type { MenuProps } from 'antd'
import type { CSSProperties, MouseEvent } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { calendarEventDtoToClient, deleteCalendarEvent, fetchCalendarEvents, fetchCalendars, patchCalendarEvent, postCalendar, postCalendarEvent } from '../../shared/api/calendarApi'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { CALENDAR_COLORS, type CustomCalendar, buildMemberAccessForMembers, calendarDtoToCustom, canUserEditCalendarEvents } from '../../shared/calendar/customCalendar'
import { ensureDefaultReminderRulesPersisted, eventRemindersFromCalendarSettings } from '../../shared/calendar/calendarReminderStorage'
import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { useOrgStore } from '../../entities/org/model/useOrgStore'
import { useHasSystemPermission } from '../../entities/permission/systemPermissions'

type CalendarView = 'month' | 'week' | 'day'

type CalendarEvent = {
  id: string
  /** 重复规则在视图上展开时用于 React key，格式 `${id}__YYYY-MM-DD` */
  displayInstanceKey?: string
  title: string
  date: string
  /** 开始时刻 HH:mm，供工作台等读取 */
  time?: string
  startHour?: number
  endHour?: number
  startAt?: string
  endAt?: string
  allDay?: boolean
  color?: 'pink' | 'blue' | 'green'
  /** 来自所选日历的色值 */
  hexColor?: string
  calendarId?: string
  ownerId?: string
  participantIds?: string[]
  repeatRule?: string
  allowFeedback?: string
  resourceId?: string
  location?: string
  /** 日程补充说明 */
  description?: string
  reminders?: { channel: string; value: number; unit: string }[]
}

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const HOUR_LABELS = Array.from({ length: 13 }, (_, index) => `${index + 6}:00`)
const CALENDAR_FAVORITES_STORAGE_KEY = 'pm-calendar-favorites-v1'

const eventClassName = (color?: CalendarEvent['color']) => {
  if (color === 'blue') return 'wt-calendar-page__event wt-calendar-page__event--blue'
  if (color === 'green') return 'wt-calendar-page__event wt-calendar-page__event--green'
  return 'wt-calendar-page__event wt-calendar-page__event--pink'
}

const buildMonthCells = (monthValue: Dayjs) => {
  const monthStart = monthValue.startOf('month')
  const gridStart = monthStart.startOf('week')
  return Array.from({ length: 42 }, (_, index) => gridStart.add(index, 'day'))
}

const buildWeekDays = (anchor: Dayjs) => {
  const start = anchor.startOf('week')
  return Array.from({ length: 7 }, (_, idx) => start.add(idx, 'day'))
}

const inSameDay = (left: Dayjs, right: Dayjs) => left.format('YYYY-MM-DD') === right.format('YYYY-MM-DD')

type RepeatCycleKind = 'none' | 'day' | 'week' | 'month'
type RepeatEndKind = 'never' | 'until' | 'count'

type RepeatRulePayload = {
  v: 1
  cycle: RepeatCycleKind
  interval: number
  weekDays?: number[]
  monthDay?: number
  end: RepeatEndKind
  until?: string
  count?: number
}

const DEFAULT_REPEAT_RULE: RepeatRulePayload = {
  v: 1,
  cycle: 'none',
  interval: 1,
  end: 'never'
}

const REPEAT_CYCLE_SELECT_OPTIONS: { value: RepeatCycleKind; label: string }[] = [
  { value: 'none', label: '从不重复' },
  { value: 'day', label: '天' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' }
]

const REPEAT_END_SELECT_OPTIONS: { value: RepeatEndKind; label: string }[] = [
  { value: 'never', label: '从不' },
  { value: 'until', label: '于日期' },
  { value: 'count', label: '重复次数' }
]

const WEEKDAY_CHECKBOX_OPTIONS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' }
]

const WEEKDAY_SUMMARY_NAMES = ['', '一', '二', '三', '四', '五', '六', '日']

const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))

function cycleUnitLabel(cycle: RepeatCycleKind): string {
  if (cycle === 'day') return '天'
  if (cycle === 'week') return '周'
  return '月'
}

function normalizeRepeatRule(data: Partial<RepeatRulePayload> | null | undefined): RepeatRulePayload {
  const cycle: RepeatCycleKind = data?.cycle === 'day' || data?.cycle === 'week' || data?.cycle === 'month' || data?.cycle === 'none' ? data.cycle : 'none'
  let interval = typeof data?.interval === 'number' && Number.isFinite(data.interval) ? Math.floor(data.interval) : 1
  if (interval < 1) interval = 1
  if (interval > 999) interval = 999
  const end: RepeatEndKind = data?.end === 'until' || data?.end === 'count' || data?.end === 'never' ? data.end : 'never'
  let weekDays = Array.isArray(data?.weekDays) ? data!.weekDays!.filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 7) : []
  weekDays = [...new Set(weekDays)].sort((a, b) => a - b)
  let monthDay = typeof data?.monthDay === 'number' && Number.isFinite(data.monthDay) ? Math.floor(data.monthDay) : 12
  if (monthDay < 1) monthDay = 1
  if (monthDay > 31) monthDay = 31
  const until = typeof data?.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.until) ? data.until : undefined
  let count = typeof data?.count === 'number' && Number.isFinite(data.count) ? Math.floor(data.count) : 1
  if (count < 1) count = 1
  if (count > 9999) count = 9999
  return {
    v: 1,
    cycle,
    interval,
    end,
    until: end === 'until' ? until : undefined,
    count: end === 'count' ? count : undefined,
    weekDays: cycle === 'week' ? weekDays : undefined,
    monthDay: cycle === 'month' ? monthDay : undefined
  }
}

function parseRepeatRuleFromStorage(raw?: string): RepeatRulePayload {
  if (raw == null || String(raw).trim() === '') return { ...DEFAULT_REPEAT_RULE }
  const trimmed = String(raw).trim()
  try {
    const j = JSON.parse(trimmed) as unknown
    if (j && typeof j === 'object' && 'cycle' in (j as object)) {
      return normalizeRepeatRule(j as Partial<RepeatRulePayload>)
    }
  } catch {
    /* legacy string */
  }
  const legacy = trimmed
  if (legacy === 'none' || legacy === '从不重复') return { ...DEFAULT_REPEAT_RULE }
  if (legacy === 'daily' || legacy === '每天') return normalizeRepeatRule({ v: 1, cycle: 'day', interval: 1, end: 'never' })
  if (legacy === 'weekly' || legacy === '每周') return normalizeRepeatRule({ v: 1, cycle: 'week', interval: 1, weekDays: [1], end: 'never' })
  if (legacy === 'workdays' || legacy === '工作日') return normalizeRepeatRule({ v: 1, cycle: 'week', interval: 1, weekDays: [1, 2, 3, 4, 5], end: 'never' })
  if (legacy === 'monthly' || legacy === '每月') return normalizeRepeatRule({ v: 1, cycle: 'month', interval: 1, monthDay: 1, end: 'never' })
  return { ...DEFAULT_REPEAT_RULE }
}

function serializeRepeatRule(data: RepeatRulePayload): string {
  return JSON.stringify(normalizeRepeatRule(data))
}

function formatRepeatRuleSummary(data: RepeatRulePayload): string {
  const r = normalizeRepeatRule(data)
  if (r.cycle === 'none') return '从不重复'
  const endParts: string[] = []
  if (r.end === 'until' && r.until) endParts.push(`截至 ${r.until}`)
  if (r.end === 'count' && r.count) endParts.push(`共 ${r.count} 次`)
  const tail = endParts.length ? `，${endParts.join('，')}` : ''
  if (r.cycle === 'day') {
    if (r.interval <= 1) return `每天${tail}`
    return `每 ${r.interval} 天${tail}`
  }
  if (r.cycle === 'week') {
    const primary = r.interval <= 1 ? '每周' : `每 ${r.interval} 周`
    const days = r.weekDays?.length ? r.weekDays : [1]
    const labels = days.map(d => `周${WEEKDAY_SUMMARY_NAMES[d] ?? '一'}`)
    return `${primary}，${labels.join('、')}${tail}`
  }
  const md = r.monthDay ?? 1
  if (r.interval <= 1) return `每月第 ${md} 天${tail}`
  return `每 ${r.interval} 个月第 ${md} 天${tail}`
}

const REMINDER_CHANNEL_OPTIONS = [
  { value: 'system', label: '系统消息' },
  { value: 'email', label: '邮件' },
  { value: 'both', label: '系统消息 + 邮件' }
]

const REMINDER_UNIT_OPTIONS = [
  { value: 'minutes', label: '分钟' },
  { value: 'hours', label: '小时' },
  { value: 'days', label: '天' }
]

/** 无日历上下文时的兜底（一般会用 eventRemindersFromCalendarSettings） */
const DEFAULT_EVENT_REMINDERS: { channel: string; value: number; unit: string }[] = [{ channel: 'system', value: 15, unit: 'minutes' }]

function roundNextHalfHour(base: Dayjs): Dayjs {
  const input = base.second(0).millisecond(0)
  const m = input.minute()
  const step = m % 30
  if (step === 0) return input.add(30, 'minute')
  return input.add(30 - step, 'minute')
}

function eventStart(item: CalendarEvent): Dayjs {
  if (item.startAt) return dayjs(item.startAt)
  return dayjs(item.date)
    .hour(typeof item.startHour === 'number' ? item.startHour : 9)
    .minute(0)
    .second(0)
}

function eventEnd(item: CalendarEvent): Dayjs {
  if (item.endAt) return dayjs(item.endAt)
  const sh = typeof item.startHour === 'number' ? item.startHour : 9
  const eh = typeof item.endHour === 'number' ? item.endHour : sh + 1
  return dayjs(item.date).hour(eh).minute(0).second(0)
}

/** UI 周选择：1=一 … 7=日，与 dayjs().day()（0=日）对齐 */
function dayjsToModelWeekday(d: Dayjs): number {
  const j = d.day()
  return j === 0 ? 7 : j
}

function copyEventAtOccurrence(ev: CalendarEvent, day: Dayjs, startTpl: Dayjs, durMin: number): CalendarEvent {
  const occStart = day.hour(startTpl.hour()).minute(startTpl.minute()).second(startTpl.second()).millisecond(startTpl.millisecond())
  const occEnd = occStart.add(durMin, 'minute')
  const date = occStart.format('YYYY-MM-DD')
  return {
    ...ev,
    date,
    time: ev.allDay ? undefined : occStart.format('HH:mm'),
    startAt: occStart.toISOString(),
    endAt: occEnd.toISOString(),
    startHour: occStart.hour(),
    endHour: occEnd.hour(),
    displayInstanceKey: `${ev.id}__${date}`
  }
}

/** 在 from～to（含）日期范围内按重复规则展开，供月/周/日格子展示 */
function expandRecurringEventsInRange(events: CalendarEvent[], rangeFromYmd: string, rangeToYmd: string): CalendarEvent[] {
  const rangeStart = dayjs(rangeFromYmd).startOf('day')
  const rangeEnd = dayjs(rangeToYmd).endOf('day')
  const flat: CalendarEvent[] = []

  for (const ev of events) {
    const rule = parseRepeatRuleFromStorage(ev.repeatRule)
    if (!ev.repeatRule?.trim() || rule.cycle === 'none') {
      flat.push(ev)
      continue
    }

    const start0 = eventStart(ev)
    const end0 = eventEnd(ev)
    const durMin = Math.max(end0.diff(start0, 'minute'), 1)
    if (durMin > 36 * 60) {
      flat.push(ev)
      continue
    }

    const anchor = start0

    if (rule.cycle === 'week') {
      const interval = Math.max(rule.interval, 1)
      const wdays = rule.weekDays?.length ? rule.weekDays : [dayjsToModelWeekday(anchor)]

      const inWeekPhase = (day: Dayjs) => {
        const wAnchor = anchor.clone().startOf('week')
        const wCur = day.clone().startOf('week')
        const wk = wCur.diff(wAnchor, 'week')
        return wk >= 0 && wk % interval === 0
      }

      const untilDay = rule.end === 'until' && rule.until && dayjs(rule.until).isValid() ? dayjs(rule.until).endOf('day') : null
      const effectiveRangeEnd = untilDay && untilDay.isBefore(rangeEnd) ? untilDay : rangeEnd

      if (rule.end === 'count' && rule.count && rule.count > 0) {
        const maxOcc = Math.min(rule.count, 2000)
        let seriesIdx = 0
        let scan = anchor.clone().startOf('day')
        let guard = 0
        while (seriesIdx < maxOcc && guard < 10000) {
          if (!scan.isBefore(anchor, 'day') && wdays.includes(dayjsToModelWeekday(scan)) && inWeekPhase(scan)) {
            seriesIdx++
            if (!scan.isBefore(rangeStart, 'day') && !scan.isAfter(effectiveRangeEnd, 'day')) {
              flat.push(copyEventAtOccurrence(ev, scan, start0, durMin))
            }
          }
          scan = scan.add(1, 'day')
          guard++
        }
        continue
      }

      let d = rangeStart.clone().startOf('day')
      if (d.isBefore(anchor, 'day')) d = anchor.clone().startOf('day')
      while (!d.isAfter(effectiveRangeEnd, 'day') && !d.isAfter(rangeEnd, 'day')) {
        if (!d.isBefore(anchor, 'day') && wdays.includes(dayjsToModelWeekday(d)) && inWeekPhase(d)) {
          flat.push(copyEventAtOccurrence(ev, d, start0, durMin))
        }
        d = d.add(1, 'day')
      }
      continue
    }

    if (rule.cycle === 'day') {
      const interval = Math.max(rule.interval, 1)
      const untilDay = rule.end === 'until' && rule.until && dayjs(rule.until).isValid() ? dayjs(rule.until).endOf('day') : null
      const effectiveRangeEnd = untilDay && untilDay.isBefore(rangeEnd) ? untilDay : rangeEnd

      const dayMatches = (d: Dayjs) => {
        if (d.isBefore(anchor, 'day')) return false
        const daysFrom = d.startOf('day').diff(anchor.startOf('day'), 'day')
        return daysFrom >= 0 && daysFrom % interval === 0
      }

      if (rule.end === 'count' && rule.count && rule.count > 0) {
        const maxOcc = Math.min(rule.count, 2000)
        let seriesIdx = 0
        let scan = anchor.clone().startOf('day')
        let guard = 0
        while (seriesIdx < maxOcc && guard < 10000) {
          if (dayMatches(scan)) {
            seriesIdx++
            if (!scan.isBefore(rangeStart, 'day') && !scan.isAfter(effectiveRangeEnd, 'day')) {
              flat.push(copyEventAtOccurrence(ev, scan, start0, durMin))
            }
          }
          scan = scan.add(1, 'day')
          guard++
        }
        continue
      }

      let d = rangeStart.clone().startOf('day')
      if (d.isBefore(anchor, 'day')) d = anchor.clone().startOf('day')
      while (!d.isAfter(effectiveRangeEnd, 'day') && !d.isAfter(rangeEnd, 'day')) {
        if (dayMatches(d)) flat.push(copyEventAtOccurrence(ev, d, start0, durMin))
        d = d.add(1, 'day')
      }
      continue
    }

    if (rule.cycle === 'month') {
      const interval = Math.max(rule.interval, 1)
      const targetDom = Math.min(31, Math.max(1, rule.monthDay ?? anchor.date()))
      const untilDay = rule.end === 'until' && rule.until && dayjs(rule.until).isValid() ? dayjs(rule.until).endOf('day') : null
      const effectiveRangeEnd = untilDay && untilDay.isBefore(rangeEnd) ? untilDay : rangeEnd

      const monthMatches = (d: Dayjs) => {
        if (d.date() !== targetDom) return false
        if (d.isBefore(anchor, 'day')) return false
        const months = d.year() * 12 + d.month() - (anchor.year() * 12 + anchor.month())
        return months >= 0 && months % interval === 0
      }

      if (rule.end === 'count' && rule.count && rule.count > 0) {
        const maxOcc = Math.min(rule.count, 1000)
        let seriesIdx = 0
        let scan = anchor.clone().startOf('day')
        let guard = 0
        while (seriesIdx < maxOcc && guard < 12000) {
          if (monthMatches(scan)) {
            seriesIdx++
            if (!scan.isBefore(rangeStart, 'day') && !scan.isAfter(effectiveRangeEnd, 'day')) {
              flat.push(copyEventAtOccurrence(ev, scan, start0, durMin))
            }
          }
          scan = scan.add(1, 'day')
          guard++
        }
        continue
      }

      let d = rangeStart.clone().startOf('day')
      if (d.isBefore(anchor, 'day')) d = anchor.clone().startOf('day')
      while (!d.isAfter(effectiveRangeEnd, 'day') && !d.isAfter(rangeEnd, 'day')) {
        if (monthMatches(d)) flat.push(copyEventAtOccurrence(ev, d, start0, durMin))
        d = d.add(1, 'day')
      }
      continue
    }

    flat.push(ev)
  }

  return flat
}

function formatEventTimeLabel(item: CalendarEvent): string | null {
  if (item.allDay) return null
  if (item.time && /^\d{1,2}:\d{2}$/.test(item.time)) return item.time
  if (item.startAt) return dayjs(item.startAt).format('HH:mm')
  if (typeof item.startHour === 'number') return `${String(item.startHour).padStart(2, '0')}:00`
  return null
}

function formatEventMonthLine(item: CalendarEvent): string {
  if (item.allDay) {
    if (/^全天\s/.test(item.title)) return item.title
    return `全天 ${item.title}`
  }
  const t = formatEventTimeLabel(item)
  if (t && !/^\d{1,2}:\d{2}/.test(item.title)) return `${t} ${item.title}`
  return item.title
}

function eventBlockClassAndStyle(item: CalendarEvent): { className: string; style?: CSSProperties } {
  if (item.hexColor) {
    return {
      className: 'wt-calendar-page__event wt-calendar-page__event--hex',
      style: {
        background: `${item.hexColor}2e`,
        color: 'rgba(0,0,0,0.78)',
        borderLeft: `3px solid ${item.hexColor}`
      }
    }
  }
  return { className: eventClassName(item.color) }
}

function weekDayGeometry(item: CalendarEvent, dayKey: string): { top: number; height: number } | null {
  const start = eventStart(item)
  if (start.format('YYYY-MM-DD') !== dayKey) return null
  if (item.allDay) return { top: 2, height: 22 }
  const end = eventEnd(item)
  const day0 = start.startOf('day').hour(6).minute(0).second(0)
  const minutesFrom6am = Math.max(0, start.diff(day0, 'minute'))
  const top = (minutesFrom6am / 60) * 44 + 2
  const durMin = Math.max(end.diff(start, 'minute'), 15)
  const height = Math.max((durMin / 60) * 44 - 6, 26)
  return { top, height }
}

function readFavoriteCalendarIds(): Set<string> {
  try {
    const raw = localStorage.getItem(CALENDAR_FAVORITES_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function persistFavoriteCalendarIds(ids: Set<string>) {
  try {
    localStorage.setItem(CALENDAR_FAVORITES_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

type EventFormValues = {
  title: string
  startAt: Dayjs
  endAt: Dayjs
  repeat: string
  calendarId: string
  participants: string[]
  location?: string
  description?: string
  reminders: { channel: string; value: number; unit: string }[]
}

export function CalendarPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [view, setView] = useState<CalendarView>('month')
  const [cursorDate, setCursorDate] = useState(() => dayjs())
  const orgMembers = useOrgStore(s => s.members)
  const authedUserId = useAuthStore(s => s.authedUserId)
  const canCreatePublicCalendar = useHasSystemPermission('calendar.create_public')
  const canCreatePrivateCalendar = useHasSystemPermission('calendar.create_private')
  const [customCalendars, setCustomCalendars] = useState<CustomCalendar[]>([])
  const [calendarModalOpen, setCalendarModalOpen] = useState(false)
  const [newCalendarName, setNewCalendarName] = useState('')
  const [selectedColor, setSelectedColor] = useState(CALENDAR_COLORS[0])
  const [visibility, setVisibility] = useState<'private' | 'team'>('private')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [showMemberPicker, setShowMemberPicker] = useState(false)
  const [activeCalendarKey, setActiveCalendarKey] = useState<string>('all')
  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [repeatRuleModalOpen, setRepeatRuleModalOpen] = useState(false)
  const [repeatDraft, setRepeatDraft] = useState<RepeatRulePayload>(() => ({ ...DEFAULT_REPEAT_RULE }))
  const [eventForm] = Form.useForm<EventFormValues>()
  const [favoriteCalendarIds, setFavoriteCalendarIds] = useState(() => readFavoriteCalendarIds())
  const [calendarRowMenuOpenId, setCalendarRowMenuOpenId] = useState<string | null>(null)

  const occurrenceSnapshotRef = useRef<CalendarEvent | null>(null)

  const applyEventEditFormValues = useCallback(() => {
    if (!editingEvent) return
    const snap = occurrenceSnapshotRef.current
    const master = editingEvent
    const source = snap ?? master
    const calId = source.calendarId ?? master.calendarId ?? customCalendars[0]?.id ?? ''
    eventForm.setFieldsValue({
      title: source.title,
      startAt: eventStart(source),
      endAt: eventEnd(source),
      repeat: source.repeatRule ?? master.repeatRule ?? serializeRepeatRule(DEFAULT_REPEAT_RULE),
      calendarId: calId,
      participants: source.participantIds?.length ? source.participantIds : source.ownerId ? [source.ownerId] : authedUserId ? [authedUserId] : [],
      location: source.location ?? '',
      description: source.description ?? '',
      reminders: source.reminders?.length
        ? source.reminders
        : eventRemindersFromCalendarSettings(calId || customCalendars[0]?.id || ''),
    })
  }, [authedUserId, customCalendars, editingEvent, eventForm])

  useLayoutEffect(() => {
    if (!eventModalOpen || !editingEvent) return
    applyEventEditFormValues()
  }, [applyEventEditFormValues, eventModalOpen, editingEvent])

  const memberMap = useMemo(() => new Map(orgMembers.map(member => [member.id, member])), [orgMembers])

  const watchedEventCalendarId = Form.useWatch('calendarId', eventForm)

  useEffect(() => {
    if (!eventModalOpen || editingEvent) return
    if (!watchedEventCalendarId) return
    eventForm.setFieldValue('reminders', eventRemindersFromCalendarSettings(watchedEventCalendarId))
  }, [editingEvent, eventForm, eventModalOpen, watchedEventCalendarId])

  const editingEventCalendar = useMemo(() => (editingEvent?.calendarId ? customCalendars.find(c => c.id === editingEvent.calendarId) : undefined), [customCalendars, editingEvent])
  const eventFormReadOnly = useMemo(() => {
    if (!editingEvent) return false
    if (!authedUserId) return true
    // 后端日历列表尚未返回时，不要用 undefined 误判为只读；整表 disabled 会导致 DatePicker 等首帧不展示已写入的值
    if (editingEvent.calendarId && !editingEventCalendar && isBackendAuthEnabled() && customCalendars.length === 0) {
      return false
    }
    if (editingEvent.calendarId && !editingEventCalendar) {
      return true
    }
    return !canUserEditCalendarEvents(editingEventCalendar, authedUserId)
  }, [authedUserId, customCalendars.length, editingEvent, editingEventCalendar])

  const monthCells = useMemo(() => buildMonthCells(cursorDate), [cursorDate])
  const weekDays = useMemo(() => buildWeekDays(cursorDate), [cursorDate])

  const eventsQueryRange = useMemo(() => {
    if (view === 'month') {
      const start = cursorDate.startOf('month').startOf('week')
      const end = cursorDate.endOf('month').endOf('week')
      return { from: start.format('YYYY-MM-DD'), to: end.format('YYYY-MM-DD') }
    }
    if (view === 'week') {
      const start = cursorDate.startOf('week')
      const end = cursorDate.endOf('week')
      return { from: start.format('YYYY-MM-DD'), to: end.format('YYYY-MM-DD') }
    }
    const d = cursorDate
    return { from: d.format('YYYY-MM-DD'), to: d.format('YYYY-MM-DD') }
  }, [view, cursorDate])

  useEffect(() => {
    const st = location.state as { message?: string } | null
    const m = st?.message
    if (!m) return
    message.warning(m)
    navigate(location.pathname + location.search, { replace: true, state: null })
  }, [location, navigate])

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [calendarEventsLoading, setCalendarEventsLoading] = useState(false)

  const appendCalendarEvent = useCallback((ev: CalendarEvent) => {
    setCalendarEvents(prev => [...prev, ev])
    window.dispatchEvent(new Event('pm-calendar-updated'))
  }, [])

  useEffect(() => {
    if (!isBackendAuthEnabled() || !authedUserId) return
    let cancelled = false
    void (async () => {
      const res = await fetchCalendars()
      if (cancelled) return
      if (!res.ok) {
        message.error(res.message)
        setCustomCalendars([])
        return
      }
      setCustomCalendars(res.data.map(calendarDtoToCustom))
    })()
    return () => {
      cancelled = true
    }
  }, [authedUserId])

  useEffect(() => {
    if (!isBackendAuthEnabled() || !authedUserId) return
    let cancelled = false
    setCalendarEventsLoading(true)
    void (async () => {
      const res = await fetchCalendarEvents({ from: eventsQueryRange.from, to: eventsQueryRange.to })
      if (cancelled) return
      setCalendarEventsLoading(false)
      if (!res.ok) {
        message.error(res.message)
        setCalendarEvents([])
        return
      }
      setCalendarEvents(res.data.map(d => calendarEventDtoToClient(d) as CalendarEvent))
    })()
    return () => {
      cancelled = true
    }
  }, [authedUserId, eventsQueryRange.from, eventsQueryRange.to])

  const visibleEvents = useMemo(() => {
    if (activeCalendarKey === 'all') return calendarEvents
    if (activeCalendarKey === 'mine') return calendarEvents.filter(item => !!authedUserId && item.ownerId === authedUserId)
    return calendarEvents.filter(item => item.calendarId === activeCalendarKey)
  }, [activeCalendarKey, authedUserId, calendarEvents])

  const displayEvents = useMemo(() => expandRecurringEventsInRange(visibleEvents, eventsQueryRange.from, eventsQueryRange.to), [visibleEvents, eventsQueryRange.from, eventsQueryRange.to])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    displayEvents.forEach(item => {
      if (view === 'month') {
        const startD = eventStart(item).startOf('day')
        const endD = eventEnd(item).startOf('day')
        for (let d = startD; !d.isAfter(endD, 'day'); d = d.add(1, 'day')) {
          const key = d.format('YYYY-MM-DD')
          const list = map.get(key) ?? []
          list.push(item)
          map.set(key, list)
        }
      } else {
        const key = eventStart(item).format('YYYY-MM-DD')
        const list = map.get(key) ?? []
        list.push(item)
        map.set(key, list)
      }
    })
    return map
  }, [displayEvents, view])

  const titleText = useMemo(() => {
    if (view === 'month') return `${cursorDate.year()}年${cursorDate.month() + 1}月`
    if (view === 'week') {
      const start = cursorDate.startOf('week')
      const end = cursorDate.endOf('week')
      return `${start.year()}年${start.month() + 1}月${start.date()}日 - ${end.month() + 1}月${end.date()}日`
    }
    return `${cursorDate.year()}年${cursorDate.month() + 1}月${cursorDate.date()}日`
  }, [cursorDate, view])

  const shiftByView = (dir: -1 | 1) => {
    if (view === 'month') setCursorDate(prev => prev.add(dir, 'month'))
    if (view === 'week') setCursorDate(prev => prev.add(dir, 'week'))
    if (view === 'day') setCursorDate(prev => prev.add(dir, 'day'))
  }

  const canManageSidebarCalendar = useCallback(
    (item: CustomCalendar) => {
      if (!authedUserId) return false
      if (!item.ownerUserId) return true
      return item.ownerUserId === authedUserId
    },
    [authedUserId]
  )

  const toggleFavoriteCalendar = (id: string, e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setFavoriteCalendarIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persistFavoriteCalendarIds(next)
      return next
    })
  }

  const createCalendar = () => {
    if (visibility === 'team' && !canCreatePublicCalendar) {
      message.warning('暂无新建公开日历权限')
      return
    }
    if (visibility === 'private' && !canCreatePrivateCalendar) {
      message.warning('暂无新建私有日历权限')
      return
    }
    const name = newCalendarName.trim()
    if (!name) {
      message.warning('请输入日历名称')
      return
    }
    if (customCalendars.some(item => item.name.toLowerCase() === name.toLowerCase())) {
      message.warning('日历名称已存在')
      return
    }
    void (async () => {
      const res = await postCalendar({
        name,
        color: selectedColor,
        visibility,
        memberIds: selectedMemberIds,
        memberAccess: buildMemberAccessForMembers(authedUserId ?? undefined, selectedMemberIds, {})
      })
      if (!res.ok) {
        message.error(res.message)
        return
      }
      const row = calendarDtoToCustom(res.data)
      ensureDefaultReminderRulesPersisted(row.id)
      setCustomCalendars(prev => [...prev, row])
      setActiveCalendarKey(row.id)
      setCalendarModalOpen(false)
      setNewCalendarName('')
      setSelectedColor(CALENDAR_COLORS[0])
      setVisibility('private')
      setSelectedMemberIds(authedUserId ? [authedUserId] : [])
      setShowMemberPicker(false)
      message.success('已创建新日历')
    })()
  }

  const openCalendarModal = () => {
    if (!canCreatePublicCalendar && !canCreatePrivateCalendar) {
      message.warning('暂无创建日历权限')
      return
    }
    setCalendarModalOpen(true)
    setSelectedMemberIds(authedUserId ? [authedUserId] : [])
    setShowMemberPicker(false)
  }

  const calendarOptionsForEvent = useMemo(
    () =>
      (authedUserId ? customCalendars.filter(c => canUserEditCalendarEvents(c, authedUserId)) : customCalendars).map(c => ({
        value: c.id,
        label: c.name
      })),
    [customCalendars, authedUserId]
  )

  const hasEditableCalendar = useMemo(() => !authedUserId || customCalendars.some(c => canUserEditCalendarEvents(c, authedUserId)), [authedUserId, customCalendars])

  const openCreateEventModal = () => {
    setEditingEvent(null)
    if (!customCalendars.length) {
      message.warning('请先创建日历后再新建日程')
      return
    }
    const preferredId = activeCalendarKey !== 'all' && activeCalendarKey !== 'mine' && customCalendars.some(c => c.id === activeCalendarKey) ? activeCalendarKey : null
    const preferredCal = preferredId ? customCalendars.find(c => c.id === preferredId) : undefined
    let defaultCalId = customCalendars[0]?.id ?? ''
    if (authedUserId) {
      if (preferredCal && canUserEditCalendarEvents(preferredCal, authedUserId)) {
        defaultCalId = preferredCal.id
      } else {
        const firstEditable = customCalendars.find(c => canUserEditCalendarEvents(c, authedUserId))
        if (!firstEditable) {
          message.warning('您在可访问的日历上均为只读权限，无法新建日程')
          return
        }
        defaultCalId = firstEditable.id
      }
    }
    const timeRef = roundNextHalfHour(dayjs())
    const startDefault = cursorDate.hour(timeRef.hour()).minute(timeRef.minute()).second(0).millisecond(0)
    const endDefault = startDefault.add(30, 'minute')
    eventForm.resetFields()
    eventForm.setFieldsValue({
      title: '',
      startAt: startDefault,
      endAt: endDefault,
      repeat: serializeRepeatRule(DEFAULT_REPEAT_RULE),
      calendarId: defaultCalId,
      participants: authedUserId ? [authedUserId] : [],
      location: '',
      description: '',
      reminders: eventRemindersFromCalendarSettings(defaultCalId),
    })
    setEventModalOpen(true)
  }

  const closeCreateEventModal = () => {
    setEventModalOpen(false)
    setEditingEvent(null)
    occurrenceSnapshotRef.current = null
    setRepeatRuleModalOpen(false)
    eventForm.resetFields()
  }

  const openEventForEdit = (ev: CalendarEvent) => {
    const master = calendarEvents.find(e => e.id === ev.id) ?? ev
    occurrenceSnapshotRef.current = ev
    setEditingEvent(master)
    setEventModalOpen(true)
  }

  const submitEventModal = async () => {
    try {
      const values = await eventForm.validateFields()
      handleSaveEvent(values)
    } catch {
      /* validation */
    }
  }

  const handleDeleteEditingEvent = async () => {
    if (!editingEvent) return
    const res = await deleteCalendarEvent(editingEvent.id)
    if (!res.ok) {
      message.error(res.message)
      return
    }
    setCalendarEvents(prev => prev.filter(e => e.id !== editingEvent.id))
    window.dispatchEvent(new Event('pm-calendar-updated'))
    message.success('日程已删除')
    closeCreateEventModal()
  }

  const openRepeatRuleModal = () => {
    if (eventFormReadOnly) return
    const raw = eventForm.getFieldValue('repeat') as string | undefined
    setRepeatDraft(normalizeRepeatRule(parseRepeatRuleFromStorage(raw)))
    setRepeatRuleModalOpen(true)
  }

  const commitRepeatRuleModal = () => {
    const d = normalizeRepeatRule(repeatDraft)
    if (d.cycle !== 'none') {
      if (d.cycle === 'week' && (!d.weekDays || d.weekDays.length === 0)) {
        message.warning('按周重复时请至少选择一周中的某一天')
        return
      }
      if (d.end === 'until' && !d.until) {
        message.warning('请选择结束日期')
        return
      }
      if (d.end === 'count' && (!d.count || d.count < 1)) {
        message.warning('请填写重复次数')
        return
      }
    }
    eventForm.setFieldsValue({ repeat: serializeRepeatRule(d) })
    setRepeatRuleModalOpen(false)
  }

  const handleSaveEvent = (values: EventFormValues) => {
    if (eventFormReadOnly) return
    const title = (values.title || '').trim()
    if (!title) {
      message.warning('请输入日程标题')
      return
    }
    let start = values.startAt
    let end = values.endAt
    if (!end.isAfter(start)) {
      message.error('结束时间须晚于开始时间')
      return
    }
    const calId = values.calendarId
    const cal = customCalendars.find(c => c.id === calId)
    if (cal && authedUserId && !canUserEditCalendarEvents(cal, authedUserId)) {
      message.warning('您对此日历仅有只读权限')
      return
    }
    const participantIds = values.participants?.length ? values.participants : authedUserId ? [authedUserId] : []

    const remindersForSave =
      values.reminders && values.reminders.length > 0
        ? values.reminders
        : editingEvent
          ? []
          : eventRemindersFromCalendarSettings(calId)

    if (editingEvent) {
      void (async () => {
        const res = await patchCalendarEvent(editingEvent.id, {
          title,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          allDay: editingEvent.allDay ?? false,
          repeatRule: values.repeat,
          participantIds,
          location: (values.location || '').trim() || null,
          description: (values.description || '').trim() || null,
          reminders: remindersForSave
        })
        if (!res.ok) {
          message.error(res.message)
          return
        }
        const clientEv = calendarEventDtoToClient(res.data) as CalendarEvent
        setCalendarEvents(prev => prev.map(e => (e.id === editingEvent.id ? clientEv : e)))
        window.dispatchEvent(new Event('pm-inbox-summary-refresh'))
        window.dispatchEvent(new Event('pm-calendar-updated'))
        closeCreateEventModal()
        message.success('日程已更新')
      })()
      return
    }

    void (async () => {
      const res = await postCalendarEvent({
        calendarId: calId,
        title,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        allDay: false,
        repeatRule: values.repeat,
        participantIds,
        location: (values.location || '').trim() || null,
        description: (values.description || '').trim() || null,
        reminders: remindersForSave
      })
      if (!res.ok) {
        message.error(res.message)
        return
      }
      appendCalendarEvent(calendarEventDtoToClient(res.data) as CalendarEvent)
      window.dispatchEvent(new Event('pm-inbox-summary-refresh'))
      closeCreateEventModal()
      message.success('日程已保存')
    })()
  }

  return (
    <div className="wt-calendar-page-root">
      <div className="wt-calendar-page">
        <aside className="wt-calendar-page__left">
          <div className="wt-calendar-page__mini-head">
            <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => setCursorDate(prev => prev.subtract(1, 'month'))} />
            <Typography.Text>{`${cursorDate.year()}年${cursorDate.month() + 1}月`}</Typography.Text>
            <Button type="text" size="small" icon={<RightOutlined />} onClick={() => setCursorDate(prev => prev.add(1, 'month'))} />
          </div>
          <div className="wt-calendar-page__mini-week">
            {WEEK_LABELS.map(label => (
              <span key={`mini-week-${label}`}>{label}</span>
            ))}
          </div>
          <div className="wt-calendar-page__mini-grid">
            {buildMonthCells(cursorDate).map(date => {
              const isCurrentMonth = date.month() === cursorDate.month()
              const isToday = date.isSame(dayjs(), 'day')
              const isSelected = inSameDay(date, cursorDate)
              return (
                <button
                  key={date.format('YYYY-MM-DD')}
                  type="button"
                  className={['wt-calendar-page__mini-cell', !isCurrentMonth ? 'wt-calendar-page__mini-cell--muted' : '', isToday ? 'wt-calendar-page__mini-cell--today' : '', isSelected ? 'wt-calendar-page__mini-cell--selected' : ''].filter(Boolean).join(' ')}
                  onClick={() => setCursorDate(date)}
                >
                  {date.date()}
                </button>
              )
            })}
          </div>

          <div className="wt-calendar-page__left-title-row">
            <div className="wt-calendar-page__left-title">日历</div>
            <Button type="text" size="small" icon={<PlusOutlined />} aria-label="创建新日历" onClick={openCalendarModal} />
          </div>
          <button type="button" className={activeCalendarKey === 'all' ? 'wt-calendar-page__left-item wt-calendar-page__left-item--active' : 'wt-calendar-page__left-item'} onClick={() => setActiveCalendarKey('all')}>
            全部日程
          </button>
          <button type="button" className={activeCalendarKey === 'mine' ? 'wt-calendar-page__left-item wt-calendar-page__left-item--active' : 'wt-calendar-page__left-item'} onClick={() => setActiveCalendarKey('mine')}>
            我的日程
          </button>
          {customCalendars.length ? (
            <div className="wt-calendar-page__left-group">
              {[
                ...customCalendars.filter(item => {
                  if (item.visibility !== 'team') return true
                  return Boolean(authedUserId)
                })
              ]
                .sort((a, b) => Number(favoriteCalendarIds.has(b.id)) - Number(favoriteCalendarIds.has(a.id)))
                .map(item => {
                  const active = activeCalendarKey === item.id
                  const canManage = canManageSidebarCalendar(item)
                  const rowClass = ['wt-calendar-page__left-item-row', active ? 'wt-calendar-page__left-item-row--active' : '', calendarRowMenuOpenId === item.id ? 'wt-calendar-page__left-item-row--menu-open' : ''].filter(Boolean).join(' ')
                  if (!canManage) {
                    return (
                      <button type="button" key={item.id} className={active ? 'wt-calendar-page__left-item wt-calendar-page__left-item--active' : 'wt-calendar-page__left-item'} onClick={() => setActiveCalendarKey(item.id)}>
                        <span className="wt-calendar-page__left-item-dot" style={{ backgroundColor: item.color }} />
                        {item.name}
                      </button>
                    )
                  }
                  const menuItems: MenuProps['items'] = [
                    { key: 'edit', icon: <EditOutlined />, label: '编辑基本信息' },
                    { type: 'divider' },
                    { key: 'members', icon: <UserOutlined />, label: '日历成员' },
                    { key: 'remind', icon: <ClockCircleOutlined />, label: '提醒设置' },
                    { type: 'divider' },
                    { key: 'more', icon: <UnorderedListOutlined />, label: '更多设置' }
                  ]
                  return (
                    <div key={item.id} className={rowClass}>
                      <button type="button" className="wt-calendar-page__left-item-main" onClick={() => setActiveCalendarKey(item.id)}>
                        <span className="wt-calendar-page__left-item-dot" style={{ backgroundColor: item.color }} />
                        <span className="wt-calendar-page__left-item-main-text">{item.name}</span>
                      </button>
                      <div className="wt-calendar-page__left-item-actions" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                        <Button
                          type="text"
                          size="small"
                          className="wt-calendar-page__left-item-star"
                          aria-label={favoriteCalendarIds.has(item.id) ? '取消收藏' : '收藏'}
                          icon={favoriteCalendarIds.has(item.id) ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                          onClick={e => toggleFavoriteCalendar(item.id, e)}
                        />
                        <Dropdown
                          menu={{
                            items: menuItems,
                            onClick: ({ key, domEvent }) => {
                              domEvent.stopPropagation()
                              if (key === 'edit') navigate(`/calendar/settings/${encodeURIComponent(item.id)}/basic`)
                              if (key === 'members') navigate(`/calendar/settings/${encodeURIComponent(item.id)}/members`)
                              if (key === 'remind') navigate(`/calendar/settings/${encodeURIComponent(item.id)}/reminders`)
                              if (key === 'more') navigate(`/calendar/settings/${encodeURIComponent(item.id)}/advanced`)
                            }
                          }}
                          trigger={['click']}
                          onOpenChange={open => setCalendarRowMenuOpenId(open ? item.id : null)}
                        >
                          <Button type="text" size="small" className="wt-calendar-page__left-item-more" icon={<MoreOutlined />} aria-label="更多操作" />
                        </Dropdown>
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : null}
          <div className="wt-calendar-page__left-action">
            <Button type="text" icon={<PlusOutlined />} onClick={openCreateEventModal} disabled={!hasEditableCalendar}>
              创建日程
            </Button>
          </div>
        </aside>

        <section className="wt-calendar-page__main">
          <Spin spinning={Boolean(isBackendAuthEnabled() && calendarEventsLoading)}>
            <div className="wt-calendar-page__main-inner">
              <div className="wt-calendar-page__toolbar">
                <div className="wt-calendar-page__view-tabs">
                  <button type="button" className={view === 'month' ? 'wt-calendar-page__view-tab wt-calendar-page__view-tab--active' : 'wt-calendar-page__view-tab'} onClick={() => setView('month')}>
                    月
                  </button>
                  <button type="button" className={view === 'week' ? 'wt-calendar-page__view-tab wt-calendar-page__view-tab--active' : 'wt-calendar-page__view-tab'} onClick={() => setView('week')}>
                    周
                  </button>
                  <button type="button" className={view === 'day' ? 'wt-calendar-page__view-tab wt-calendar-page__view-tab--active' : 'wt-calendar-page__view-tab'} onClick={() => setView('day')}>
                    日
                  </button>
                </div>
                <div className="wt-calendar-page__title-nav">
                  <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => shiftByView(-1)} />
                  <Typography.Text>{titleText}</Typography.Text>
                  <Button type="text" size="small" icon={<RightOutlined />} onClick={() => shiftByView(1)} />
                </div>
              </div>

              {view === 'month' ? (
                <div className="wt-calendar-page__month-wrap">
                  <div className="wt-calendar-page__grid-head">
                    {WEEK_LABELS.map(label => (
                      <div key={`main-week-${label}`} className="wt-calendar-page__grid-head-cell">
                        周{label}
                      </div>
                    ))}
                  </div>

                  <div className="wt-calendar-page__grid-body">
                    {monthCells.map(date => {
                      const key = date.format('YYYY-MM-DD')
                      const events = eventsByDate.get(key) ?? []
                      const isCurrentMonth = date.month() === cursorDate.month()
                      return (
                        <div key={key} className={['wt-calendar-page__grid-cell', !isCurrentMonth ? 'wt-calendar-page__grid-cell--muted' : ''].filter(Boolean).join(' ')}>
                          <div className="wt-calendar-page__grid-date">{date.date()}</div>
                          <div className="wt-calendar-page__events">
                            {events.map(item => {
                              const cs = eventBlockClassAndStyle(item)
                              return (
                                <button
                                  key={item.displayInstanceKey ?? item.id}
                                  type="button"
                                  className={`${cs.className} wt-calendar-page__event--clickable`}
                                  style={cs.style}
                                  onClick={e => {
                                    e.stopPropagation()
                                    openEventForEdit(item)
                                  }}
                                >
                                  {formatEventMonthLine(item)}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : view === 'week' ? (
                <div className="wt-calendar-week">
                  <div className="wt-calendar-week__header">
                    <div className="wt-calendar-week__header-time" aria-hidden />
                    {weekDays.map(day => (
                      <div key={`week-head-${day.format('YYYY-MM-DD')}`} className={inSameDay(day, cursorDate) ? 'wt-calendar-week__header-day wt-calendar-week__header-day--active' : 'wt-calendar-week__header-day'}>
                        周{WEEK_LABELS[day.day()]} {day.format('M/D')}
                      </div>
                    ))}
                  </div>
                  <div className="wt-calendar-week__body">
                    <div className="wt-calendar-week__time-col">
                      {HOUR_LABELS.map(hour => (
                        <div key={`week-time-${hour}`} className="wt-calendar-week__time-cell">
                          {hour}
                        </div>
                      ))}
                    </div>
                    {weekDays.map(day => {
                      const dayKey = day.format('YYYY-MM-DD')
                      const events = eventsByDate.get(dayKey) ?? []
                      const isActive = inSameDay(day, cursorDate)
                      return (
                        <div key={`week-col-${dayKey}`} className={isActive ? 'wt-calendar-week__day-col wt-calendar-week__day-col--active' : 'wt-calendar-week__day-col'}>
                          {HOUR_LABELS.map(hour => (
                            <div key={`${dayKey}-${hour}`} className="wt-calendar-week__slot" />
                          ))}
                          <div className="wt-calendar-week__overlay-events">
                            {events.map(item => {
                              const geom = weekDayGeometry(item, dayKey)
                              if (!geom) return null
                              const cs = eventBlockClassAndStyle(item)
                              return (
                                <button
                                  key={item.displayInstanceKey ?? item.id}
                                  type="button"
                                  className={`${cs.className} wt-calendar-week__overlay-event wt-calendar-page__event--clickable`}
                                  style={{ ...cs.style, top: geom.top, height: geom.height }}
                                  onClick={e => {
                                    e.stopPropagation()
                                    openEventForEdit(item)
                                  }}
                                >
                                  {formatEventMonthLine(item)}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="wt-calendar-day">
                  <div className="wt-calendar-day__header">
                    周{WEEK_LABELS[cursorDate.day()]} {cursorDate.format('M/D')}
                  </div>
                  <div className="wt-calendar-day__body">
                    <div className="wt-calendar-day__time-col">
                      {HOUR_LABELS.map(hour => (
                        <div key={`day-time-${hour}`} className="wt-calendar-day__time-cell">
                          {hour}
                        </div>
                      ))}
                    </div>
                    <div className="wt-calendar-day__slots">
                      {HOUR_LABELS.map(hour => (
                        <div key={`day-slot-${hour}`} className="wt-calendar-day__slot" />
                      ))}
                      <div className="wt-calendar-day__overlay-events">
                        {(eventsByDate.get(cursorDate.format('YYYY-MM-DD')) ?? []).map(item => {
                          const geom = weekDayGeometry(item, cursorDate.format('YYYY-MM-DD'))
                          if (!geom) return null
                          const cs = eventBlockClassAndStyle(item)
                          return (
                            <button
                              key={item.displayInstanceKey ?? item.id}
                              type="button"
                              className={`${cs.className} wt-calendar-day__overlay-event wt-calendar-page__event--clickable`}
                              style={{ ...cs.style, top: geom.top, height: geom.height }}
                              onClick={e => {
                                e.stopPropagation()
                                openEventForEdit(item)
                              }}
                            >
                              {formatEventMonthLine(item)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Spin>
        </section>
        <Modal
          title="创建新日历"
          open={calendarModalOpen}
          onCancel={() => {
            setCalendarModalOpen(false)
            setNewCalendarName('')
            setSelectedColor(CALENDAR_COLORS[0])
            setVisibility('private')
            setSelectedMemberIds(authedUserId ? [authedUserId] : [])
            setShowMemberPicker(false)
          }}
          onOk={createCalendar}
          okText="保存"
          cancelText="取消"
          width={720}
        >
          <div className="wt-calendar-page__modal-field">
            <div className="wt-calendar-page__modal-label">日历名称 *</div>
            <Input value={newCalendarName} onChange={e => setNewCalendarName(e.target.value)} placeholder="日历名称（不超过32个字符）" maxLength={32} onPressEnter={createCalendar} />
          </div>
          <div className="wt-calendar-page__modal-colors">
            {CALENDAR_COLORS.map(color => {
              const active = selectedColor === color
              return (
                <button key={color} type="button" className={active ? 'wt-calendar-page__color-dot wt-calendar-page__color-dot--active' : 'wt-calendar-page__color-dot'} style={{ backgroundColor: color }} onClick={() => setSelectedColor(color)}>
                  {active ? <CheckOutlined /> : null}
                </button>
              )
            })}
          </div>
          <div className="wt-calendar-page__modal-field">
            <div className="wt-calendar-page__modal-label">可见范围</div>
            <Select
              value={visibility}
              onChange={value => setVisibility(value)}
              style={{ width: '100%' }}
              options={[
                { value: 'private', label: '私有：只有加入的成员才能看见此日历' },
                { value: 'team', label: '公开：通讯录全员可见；未加入成员者仅可查看日程', disabled: !canCreatePublicCalendar }
              ]}
            />
          </div>
          <div className="wt-calendar-page__modal-field">
            <div className="wt-calendar-page__modal-label">日历成员</div>
            <Space size={8}>
              {selectedMemberIds.map(id => {
                const member = memberMap.get(id)
                if (!member) return null
                return (
                  <Avatar key={id} style={member.avatarColor ? { backgroundColor: member.avatarColor } : undefined}>
                    {member.avatarText || member.name.slice(0, 2).toUpperCase()}
                  </Avatar>
                )
              })}
              <Button shape="circle" icon={<UserAddOutlined />} onClick={() => setShowMemberPicker(prev => !prev)} />
            </Space>
            {showMemberPicker ? (
              <Select
                mode="multiple"
                style={{ width: '100%', marginTop: 10 }}
                placeholder="从通讯录选择成员"
                value={selectedMemberIds}
                onChange={value => setSelectedMemberIds(value)}
                options={orgMembers.map(member => ({
                  value: member.id,
                  label: `${member.name}${member.department ? `（${member.department}）` : ''}`
                }))}
                optionFilterProp="label"
                showSearch
              />
            ) : null}
          </div>
        </Modal>

        <Modal
          title={!editingEvent ? '新建日程' : eventFormReadOnly ? '日程详情' : '编辑日程'}
          open={eventModalOpen}
          onCancel={closeCreateEventModal}
          afterOpenChange={open => {
            if (open && editingEvent) {
              queueMicrotask(() => applyEventEditFormValues())
            }
          }}
          onOk={!editingEvent ? () => void submitEventModal() : undefined}
          okText="保存"
          cancelText="取消"
          width={720}
          styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' } }}
          footer={
            eventFormReadOnly
              ? [
                  <Button key="close" type="primary" onClick={closeCreateEventModal}>
                    关闭
                  </Button>
                ]
              : editingEvent
                ? [
                    <Popconfirm key="del" title="确定删除此日程？" description="删除后不可恢复" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void handleDeleteEditingEvent()}>
                      <Button danger>删除</Button>
                    </Popconfirm>,
                    <Button key="cancel" onClick={closeCreateEventModal}>
                      取消
                    </Button>,
                    <Button key="ok" type="primary" onClick={() => void submitEventModal()}>
                      保存
                    </Button>
                  ]
                : undefined
          }
        >
          <Form form={eventForm} layout="vertical" preserve={false} disabled={eventFormReadOnly} initialValues={{ reminders: DEFAULT_EVENT_REMINDERS }}>
            <Form.Item name="repeat" hidden>
              <Input />
            </Form.Item>
            <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入日程标题' }]}>
              <Input placeholder="请输入日程标题" maxLength={200} allowClear />
            </Form.Item>
            <div className="wt-calendar-page__event-form-row2">
              <Form.Item name="startAt" label="开始时间" rules={[{ required: true, message: '请选择开始时间' }]}>
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} allowClear={false} />
              </Form.Item>
              <Form.Item name="endAt" label="结束时间" rules={[{ required: true, message: '请选择结束时间' }]}>
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} allowClear={false} />
              </Form.Item>
            </div>
            <div className="wt-calendar-page__event-form-row2">
              <Form.Item label="重复">
                <Form.Item noStyle shouldUpdate={(prev, cur) => prev.repeat !== cur.repeat}>
                  {() => {
                    const summary = formatRepeatRuleSummary(parseRepeatRuleFromStorage(eventForm.getFieldValue('repeat') as string | undefined))
                    return (
                      <div
                        className="wt-calendar-page__repeat-field"
                        role="button"
                        tabIndex={0}
                        onClick={openRepeatRuleModal}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openRepeatRuleModal()
                          }
                        }}
                      >
                        <span className="wt-calendar-page__repeat-field__value">{summary}</span>
                        <button
                          type="button"
                          className="wt-calendar-page__repeat-field__settings"
                          aria-label="设置重复规则"
                          onClick={e => {
                            e.stopPropagation()
                            openRepeatRuleModal()
                          }}
                        >
                          <SettingOutlined />
                        </button>
                      </div>
                    )
                  }}
                </Form.Item>
              </Form.Item>
              <Form.Item
                name="calendarId"
                label="日历"
                rules={[{ required: true, message: '请先创建日历，或选择您已创建的日历' }]}
                extra={
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                    {editingEvent ? '编辑时不可更换所属日历。' : '仅列出您有编辑权限的日历（含他人共享且授予您编辑权限的日历）；公开日历未加入成员时为只读。'}
                  </Typography.Text>
                }
              >
                <Select options={calendarOptionsForEvent} placeholder={customCalendars.length ? '请选择日历' : '请先在左侧创建日历'} disabled={!customCalendars.length || Boolean(editingEvent)} />
              </Form.Item>
            </div>
            <div className="wt-calendar-page__event-form-row2">
              <Form.Item name="participants" label="参与人" rules={[{ required: true, type: 'array', min: 1, message: '请选择至少一名参与人' }]}>
                <Select
                  mode="multiple"
                  placeholder="从通讯录搜索并选择成员"
                  style={{ width: '100%' }}
                  options={orgMembers.map(member => ({
                    value: member.id,
                    label: `${member.name}${member.department ? `（${member.department}）` : ''}`
                  }))}
                  optionFilterProp="label"
                  showSearch
                />
              </Form.Item>
              <Form.Item name="location" label="地点">
                <Input allowClear placeholder="选填" />
              </Form.Item>
            </div>
            <Form.List name="reminders">
              {(fields, { add, remove }) => (
                <div className="wt-calendar-page__modal-field" style={{ marginTop: 16 }}>
                  <div className="wt-calendar-page__modal-label">提醒</div>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space key={key} align="baseline" wrap style={{ marginBottom: 8 }}>
                      <Form.Item {...restField} name={[name, 'channel']} rules={[{ required: true, message: '请选择提醒方式' }]} style={{ minWidth: 120, marginBottom: 0 }}>
                        <Select options={REMINDER_CHANNEL_OPTIONS} />
                      </Form.Item>
                      <Form.Item {...restField} name={[name, 'value']} rules={[{ required: true, message: '请输入数值' }]} style={{ width: 88, marginBottom: 0 }}>
                        <InputNumber min={1} max={9999} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item {...restField} name={[name, 'unit']} rules={[{ required: true, message: '请选择单位' }]} style={{ minWidth: 88, marginBottom: 0 }}>
                        <Select options={REMINDER_UNIT_OPTIONS} />
                      </Form.Item>
                      {fields.length > 1 ? (
                        <Typography.Link type="danger" onClick={() => remove(name)}>
                          移除
                        </Typography.Link>
                      ) : null}
                    </Space>
                  ))}
                  <Typography.Link
                    onClick={() => {
                      const calId = watchedEventCalendarId || customCalendars[0]?.id
                      const preset = calId ? eventRemindersFromCalendarSettings(calId)[0] : DEFAULT_EVENT_REMINDERS[0]
                      add({ ...preset, unit: preset.unit ?? 'minutes' })
                    }}
                  >
                    + 添加新提醒
                  </Typography.Link>
                  <Typography.Text type="secondary" className="wt-calendar-page__event-reminders-hint">
                    可添加多条提醒；到点由后台定时任务写入站内信，并按所选发送邮件（SMTP 由系统管理员配置）。
                  </Typography.Text>
                </div>
              )}
            </Form.List>
            <Form.Item name="description" label="日程描述">
              <Input.TextArea rows={4} placeholder="选填：补充说明、议程等" maxLength={2000} showCount />
            </Form.Item>
          </Form>
        </Modal>

        <Modal title="设置重复规则" open={repeatRuleModalOpen} onCancel={() => setRepeatRuleModalOpen(false)} onOk={commitRepeatRuleModal} okText="确定" cancelText="取消" destroyOnHidden width={480} maskClosable={false}>
          <div className="wt-calendar-repeat-modal">
            <div className="wt-calendar-repeat-modal__row2">
              <div className="wt-calendar-repeat-modal__field">
                <div className="wt-calendar-repeat-modal__label">重复周期</div>
                <Select
                  style={{ width: '100%' }}
                  options={REPEAT_CYCLE_SELECT_OPTIONS}
                  value={repeatDraft.cycle}
                  onChange={(v: RepeatCycleKind) =>
                    setRepeatDraft(prev => {
                      let next: RepeatRulePayload = { ...prev, cycle: v }
                      if (v === 'week' && (!next.weekDays || next.weekDays.length === 0)) next = { ...next, weekDays: [2] }
                      if (v === 'month' && (next.monthDay == null || next.monthDay < 1)) next = { ...next, monthDay: 12 }
                      return normalizeRepeatRule(next)
                    })
                  }
                />
              </div>
              {repeatDraft.cycle !== 'none' ? (
                <div className="wt-calendar-repeat-modal__field">
                  <div className="wt-calendar-repeat-modal__label">重复间隔</div>
                  <div className="wt-calendar-repeat-modal__interval">
                    <InputNumber min={1} max={999} value={repeatDraft.interval} onChange={v => setRepeatDraft(prev => normalizeRepeatRule({ ...prev, interval: typeof v === 'number' && v >= 1 ? v : 1 }))} />
                    <span className="wt-calendar-repeat-modal__interval-suffix">{cycleUnitLabel(repeatDraft.cycle)}</span>
                  </div>
                </div>
              ) : (
                <div className="wt-calendar-repeat-modal__field wt-calendar-repeat-modal__field--placeholder" aria-hidden />
              )}
            </div>
            {repeatDraft.cycle === 'week' ? (
              <div className="wt-calendar-repeat-modal__field wt-calendar-repeat-modal__field--full">
                <div className="wt-calendar-repeat-modal__label">重复时间</div>
                <Checkbox.Group className="wt-calendar-repeat-modal__weekdays" options={WEEKDAY_CHECKBOX_OPTIONS} value={repeatDraft.weekDays ?? []} onChange={vals => setRepeatDraft(prev => normalizeRepeatRule({ ...prev, weekDays: vals as number[] }))} />
              </div>
            ) : null}
            {repeatDraft.cycle === 'month' ? (
              <div className="wt-calendar-repeat-modal__field wt-calendar-repeat-modal__field--full">
                <div className="wt-calendar-repeat-modal__label">重复时间</div>
                <Select style={{ width: '100%' }} value={repeatDraft.monthDay ?? 12} options={MONTH_DAY_OPTIONS} onChange={v => setRepeatDraft(prev => normalizeRepeatRule({ ...prev, monthDay: typeof v === 'number' ? v : 12 }))} />
              </div>
            ) : null}
            {repeatDraft.cycle !== 'none' ? (
              <div className="wt-calendar-repeat-modal__field wt-calendar-repeat-modal__field--full">
                <div className="wt-calendar-repeat-modal__label">结束规则</div>
                <Select
                  style={{ width: '100%' }}
                  options={REPEAT_END_SELECT_OPTIONS}
                  value={repeatDraft.end}
                  onChange={(v: RepeatEndKind) =>
                    setRepeatDraft(prev =>
                      normalizeRepeatRule({
                        ...prev,
                        end: v,
                        until: v === 'until' ? prev.until : undefined,
                        count: v === 'count' ? (prev.count ?? 1) : undefined
                      })
                    )
                  }
                />
                {repeatDraft.end === 'until' ? (
                  <DatePicker style={{ width: '100%', marginTop: 8 }} format="YYYY-MM-DD" value={repeatDraft.until ? dayjs(repeatDraft.until) : undefined} onChange={d => setRepeatDraft(prev => normalizeRepeatRule({ ...prev, until: d ? d.format('YYYY-MM-DD') : undefined }))} />
                ) : null}
                {repeatDraft.end === 'count' ? <InputNumber style={{ width: '100%', marginTop: 8 }} min={1} max={9999} placeholder="重复次数" value={repeatDraft.count} onChange={v => setRepeatDraft(prev => normalizeRepeatRule({ ...prev, count: typeof v === 'number' ? v : 1 }))} /> : null}
              </div>
            ) : null}
            <div className="wt-calendar-repeat-modal__summary">
              <div className="wt-calendar-repeat-modal__label">摘要</div>
              <Typography.Text>{formatRepeatRuleSummary(repeatDraft)}</Typography.Text>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  )
}
