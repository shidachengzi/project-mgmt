import { prisma } from '@/lib/prisma'
import { Prisma, type UserCalendar, type UserCalendarEvent } from '@prisma/client'
import { notifyCalendarEventChange } from '@/modules/notifications/userNotificationService'

export type CalendarMemberPermission = 'editor' | 'viewer'

export type CalendarDTO = {
  id: string
  ownerUserId: string
  name: string
  color: string
  visibility: 'private' | 'team'
  memberIds: string[]
  /** 非所有者成员：editor 可维护日程；viewer 只读 */
  memberAccess: Record<string, CalendarMemberPermission>
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

function parseStringArray(json: unknown): string[] {
  if (!Array.isArray(json)) return []
  return json.filter((x): x is string => typeof x === 'string')
}

function readMemberAccessJson(row: UserCalendar): unknown {
  return (row as unknown as { memberAccess?: unknown }).memberAccess
}

function parseMemberAccess(json: unknown): Record<string, CalendarMemberPermission> {
  if (json == null || typeof json !== 'object' || Array.isArray(json)) return {}
  const out: Record<string, CalendarMemberPermission> = {}
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (typeof k !== 'string' || !k) continue
    if (v === 'viewer' || v === 'editor') out[k] = v
  }
  return out
}

function buildDtoMemberAccess(ownerUserId: string, memberIds: string[], stored: Record<string, CalendarMemberPermission>): Record<string, CalendarMemberPermission> {
  const out: Record<string, CalendarMemberPermission> = {}
  for (const id of memberIds) {
    if (id === ownerUserId) continue
    out[id] = stored[id] === 'viewer' ? 'viewer' : 'editor'
  }
  return out
}

function toCalendarDto(row: UserCalendar): CalendarDTO {
  const vis = row.visibility === 'team' ? 'team' : 'private'
  const memberIds = parseStringArray(row.memberIds)
  const stored = parseMemberAccess(readMemberAccessJson(row))
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    color: row.color,
    visibility: vis,
    memberIds,
    memberAccess: buildDtoMemberAccess(row.ownerUserId, memberIds, stored),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toEventDto(row: UserCalendarEvent, hexColor: string | null): CalendarEventDTO {
  return {
    id: row.id,
    title: row.title,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    allDay: row.allDay,
    hexColor,
    calendarId: row.calendarId,
    ownerId: row.ownerUserId,
    participantIds: parseStringArray(row.participantIds),
    repeatRule: row.repeatRule,
    location: row.location,
    description: row.description,
    reminders: row.reminders as CalendarEventDTO['reminders'],
  }
}

function parseYmdBoundary(ymd: string, endOfDay: boolean): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) throw new Error('日期格式须为 YYYY-MM-DD')
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  if (endOfDay) return new Date(y, mo, d, 23, 59, 59, 999)
  return new Date(y, mo, d, 0, 0, 0, 0)
}

export async function listCalendarsForUser(userId: string): Promise<CalendarDTO[]> {
  const owned = await prisma.userCalendar.findMany({ where: { ownerUserId: userId }, orderBy: { createdAt: 'asc' } })
  const map = new Map<string, UserCalendar>()
  owned.forEach((c) => map.set(c.id, c))

  /** 私有：被显式加入 memberIds 的日历 */
  const sharedViaMembers = await prisma.$queryRaw<UserCalendar[]>(
    Prisma.sql`
      SELECT * FROM \`user_calendars\`
      WHERE \`ownerUserId\` <> ${userId}
        AND \`visibility\` <> 'team'
        AND JSON_CONTAINS(\`memberIds\`, JSON_QUOTE(${userId}), '$')
    `,
  )
  for (const c of sharedViaMembers) {
    map.set(c.id, c)
  }

  /** 公开（team）：通讯录内所有登录用户均可查看；日程编辑权仍由成员权限控制 */
  const teamOthers = await prisma.userCalendar.findMany({
    where: { visibility: 'team', ownerUserId: { not: userId } },
  })
  for (const c of teamOthers) {
    map.set(c.id, c)
  }

  return Array.from(map.values())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(toCalendarDto)
}

/** 可在该日历下新增/修改/删除日程（不含日历设置/成员管理） */
async function assertCanEditCalendarEvents(actorUserId: string, cal: UserCalendar): Promise<boolean> {
  if (cal.ownerUserId === actorUserId) return true
  const members = parseStringArray(cal.memberIds)
  if (!members.includes(actorUserId)) return false
  const acc = parseMemberAccess(readMemberAccessJson(cal))
  return acc[actorUserId] !== 'viewer'
}

export async function createUserCalendar(input: {
  ownerUserId: string
  name: string
  color: string
  visibility: 'private' | 'team'
  memberIds: string[]
  memberAccess?: Record<string, CalendarMemberPermission>
}): Promise<CalendarDTO> {
  const name = input.name.trim()
  if (!name) throw new Error('日历名称不能为空')
  const existing = await prisma.userCalendar.findMany({ where: { ownerUserId: input.ownerUserId } })
  if (existing.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) throw new Error('日历名称已存在')
  const memberAccessJson = buildDtoMemberAccess(input.ownerUserId, input.memberIds, input.memberAccess ?? {})
  const row = await prisma.userCalendar.create({
    data: {
      ownerUserId: input.ownerUserId,
      name,
      color: input.color.trim().slice(0, 32),
      visibility: input.visibility,
      memberIds: input.memberIds as unknown as Prisma.InputJsonValue,
      memberAccess: memberAccessJson as unknown as Prisma.InputJsonValue,
    },
  })
  return toCalendarDto(row)
}

export async function updateUserCalendar(input: {
  actorUserId: string
  calendarId: string
  name?: string
  color?: string
  visibility?: 'private' | 'team'
  memberIds?: string[]
  memberAccess?: Record<string, CalendarMemberPermission>
}): Promise<CalendarDTO> {
  const cal = await prisma.userCalendar.findUnique({ where: { id: input.calendarId } })
  if (!cal) throw new Error('日历不存在')
  if (cal.ownerUserId !== input.actorUserId) throw new Error('只有日历所有者可以修改')

  const data: Prisma.UserCalendarUpdateInput = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name.length) throw new Error('日历名称不能为空')
    if (name !== cal.name) {
      const existing = await prisma.userCalendar.findMany({ where: { ownerUserId: cal.ownerUserId } })
      if (existing.some((c) => c.id !== cal.id && c.name.trim().toLowerCase() === name.toLowerCase())) throw new Error('日历名称已存在')
    }
    data.name = name
  }
  if (input.color !== undefined) {
    data.color = input.color.trim().slice(0, 32)
  }
  if (input.visibility !== undefined) {
    data.visibility = input.visibility
  }

  const prevIds = parseStringArray(cal.memberIds)
  const prevAccess = parseMemberAccess(readMemberAccessJson(cal))

  if (input.memberIds !== undefined && input.memberAccess !== undefined) {
    data.memberIds = input.memberIds as unknown as Prisma.InputJsonValue
    data.memberAccess = buildDtoMemberAccess(cal.ownerUserId, input.memberIds, input.memberAccess) as unknown as Prisma.InputJsonValue
  } else if (input.memberIds !== undefined) {
    data.memberIds = input.memberIds as unknown as Prisma.InputJsonValue
    const nextAccess: Record<string, CalendarMemberPermission> = {}
    for (const id of input.memberIds) {
      if (id === cal.ownerUserId) continue
      nextAccess[id] = prevAccess[id] === 'viewer' ? 'viewer' : 'editor'
    }
    data.memberAccess = nextAccess as unknown as Prisma.InputJsonValue
  } else if (input.memberAccess !== undefined) {
    data.memberAccess = buildDtoMemberAccess(cal.ownerUserId, prevIds, input.memberAccess) as unknown as Prisma.InputJsonValue
  }

  const row = await prisma.userCalendar.update({
    where: { id: input.calendarId },
    data,
  })
  return toCalendarDto(row)
}

export async function listCalendarEventsInRange(input: {
  userId: string
  fromYmd: string
  toYmd: string
}): Promise<CalendarEventDTO[]> {
  const calendars = await listCalendarsForUser(input.userId)
  const ids = calendars.map((c) => c.id)
  if (!ids.length) return []
  const rangeStart = parseYmdBoundary(input.fromYmd, false)
  const rangeEnd = parseYmdBoundary(input.toYmd, true)
  const rows = await prisma.userCalendarEvent.findMany({
    where: {
      calendarId: { in: ids },
      AND: [{ startAt: { lte: rangeEnd } }, { endAt: { gte: rangeStart } }],
    },
    orderBy: { startAt: 'asc' },
    include: { calendar: { select: { color: true } } },
  })
  const colorByCalId = new Map(calendars.map((c) => [c.id, c.color]))
  return rows.map((r) => toEventDto(r, r.calendar?.color ?? colorByCalId.get(r.calendarId) ?? null))
}

export async function createCalendarEvent(input: {
  actorUserId: string
  calendarId: string
  title: string
  startAt: Date
  endAt: Date
  allDay?: boolean
  repeatRule?: string | null
  participantIds: string[]
  location?: string | null
  description?: string | null
  reminders?: { channel: string; value: number; unit: string }[] | null
}): Promise<CalendarEventDTO> {
  if (input.endAt <= input.startAt) throw new Error('结束时间须晚于开始时间')
  const cal = await prisma.userCalendar.findUnique({ where: { id: input.calendarId } })
  if (!cal) throw new Error('日历不存在')
  const ok = await assertCanEditCalendarEvents(input.actorUserId, cal)
  if (!ok) throw new Error('无权在此日历下创建日程')
  const effectiveReminders =
    input.reminders && input.reminders.length > 0
      ? input.reminders
      : [{ channel: 'system', value: 15, unit: 'minutes' as const }]
  const remindersJson = effectiveReminders as unknown as Prisma.InputJsonValue
  const row = await prisma.userCalendarEvent.create({
    data: {
      calendarId: input.calendarId,
      ownerUserId: input.actorUserId,
      title: input.title.trim().slice(0, 191),
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: input.allDay ?? false,
      repeatRule: input.repeatRule?.trim() || null,
      participantIds: input.participantIds as unknown as Prisma.InputJsonValue,
      location: input.location?.trim() || null,
      description: input.description?.trim() || null,
      reminders: remindersJson,
    },
    include: { calendar: { select: { color: true } } },
  })
  void notifyCalendarEventChange({
    action: 'created',
    actorUserId: input.actorUserId,
    eventId: row.id,
    calendarId: input.calendarId,
    title: row.title,
    startAt: row.startAt,
    participantIds: parseStringArray(row.participantIds),
  }).catch((e) => console.error('[notifyCalendarEventChange]', e))
  return toEventDto(row, row.calendar?.color ?? cal.color)
}

export async function updateCalendarEvent(input: {
  actorUserId: string
  eventId: string
  title: string
  startAt: Date
  endAt: Date
  allDay?: boolean
  repeatRule?: string | null
  participantIds: string[]
  location?: string | null
  description?: string | null
  reminders?: { channel: string; value: number; unit: string }[] | null
}): Promise<CalendarEventDTO> {
  if (input.endAt <= input.startAt) throw new Error('结束时间须晚于开始时间')
  const row = await prisma.userCalendarEvent.findUnique({
    where: { id: input.eventId },
    include: { calendar: true },
  })
  if (!row) throw new Error('日程不存在')
  const cal = row.calendar
  if (!cal) throw new Error('日历不存在')
  const ok = await assertCanEditCalendarEvents(input.actorUserId, cal)
  if (!ok) throw new Error('无权修改此日程')

  const remindersJson =
    input.reminders && input.reminders.length > 0 ? (input.reminders as unknown as Prisma.InputJsonValue) : undefined

  const updated = await prisma.userCalendarEvent.update({
    where: { id: input.eventId },
    data: {
      title: input.title.trim().slice(0, 191),
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: input.allDay ?? false,
      repeatRule: input.repeatRule?.trim() || null,
      participantIds: input.participantIds as unknown as Prisma.InputJsonValue,
      location: input.location?.trim() || null,
      description: input.description?.trim() || null,
      reminders: remindersJson,
    },
    include: { calendar: { select: { color: true } } },
  })
  void notifyCalendarEventChange({
    action: 'updated',
    actorUserId: input.actorUserId,
    eventId: updated.id,
    calendarId: updated.calendarId,
    title: updated.title,
    startAt: updated.startAt,
    participantIds: parseStringArray(updated.participantIds),
  }).catch((e) => console.error('[notifyCalendarEventChange]', e))
  return toEventDto(updated, updated.calendar?.color ?? cal.color)
}

export async function deleteCalendarEvent(input: { actorUserId: string; eventId: string }): Promise<void> {
  const row = await prisma.userCalendarEvent.findUnique({
    where: { id: input.eventId },
    include: { calendar: true },
  })
  if (!row) throw new Error('日程不存在')
  const cal = row.calendar
  if (!cal) throw new Error('日历不存在')
  const ok = await assertCanEditCalendarEvents(input.actorUserId, cal)
  if (!ok) throw new Error('无权删除此日程')
  await prisma.userCalendarEvent.delete({ where: { id: input.eventId } })
}

export async function deleteUserCalendar(input: { actorUserId: string; calendarId: string }): Promise<void> {
  const cal = await prisma.userCalendar.findUnique({ where: { id: input.calendarId } })
  if (!cal) throw new Error('日历不存在')
  if (cal.ownerUserId !== input.actorUserId) throw new Error('只有日历所有者可以删除')
  await prisma.$transaction([
    prisma.userCalendarEvent.deleteMany({ where: { calendarId: input.calendarId } }),
    prisma.userCalendar.delete({ where: { id: input.calendarId } }),
  ])
}
