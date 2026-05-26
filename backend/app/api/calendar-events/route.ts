import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { createCalendarEvent, listCalendarEventsInRange } from '@/modules/calendar/calendarService'

const reminderSchema = z.object({
  channel: z.string().min(1),
  value: z.number().int().min(1).max(9999),
  unit: z.string().min(1),
})

const postSchema = z
  .object({
    calendarId: z.string().min(1).max(30),
    title: z.string().min(1).max(191),
    startAt: z.string().min(1),
    endAt: z.string().min(1),
    allDay: z.boolean().optional(),
    repeatRule: z.string().max(20000).nullable().optional(),
    participantIds: z.array(z.string().min(1)).min(1),
    location: z.string().max(191).nullable().optional(),
    description: z.string().max(20000).nullable().optional(),
    reminders: z.array(reminderSchema).nullable().optional(),
  })
  .strict()

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!from || !to) return fail(400, '缺少查询参数 from、to（YYYY-MM-DD）')
  try {
    const data = await listCalendarEventsInRange({ userId: auth.userId, fromYmd: from, toYmd: to })
    return ok(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '读取日程失败'
    console.error('[GET /api/calendar-events]', e)
    return fail(500, msg)
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail(400, '请求体须为 JSON')
  }
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数无效', { issues: parsed.error.flatten() })

  let startAt: Date
  let endAt: Date
  try {
    startAt = new Date(parsed.data.startAt)
    endAt = new Date(parsed.data.endAt)
  } catch {
    return fail(400, '开始或结束时间无效')
  }
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return fail(400, '开始或结束时间无效')

  try {
    const data = await createCalendarEvent({
      actorUserId: auth.userId,
      calendarId: parsed.data.calendarId,
      title: parsed.data.title,
      startAt,
      endAt,
      allDay: parsed.data.allDay,
      repeatRule: parsed.data.repeatRule ?? null,
      participantIds: parsed.data.participantIds,
      location: parsed.data.location ?? null,
      description: parsed.data.description ?? null,
      reminders: parsed.data.reminders ?? null,
    })
    return ok(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '创建日程失败'
    if (msg === '日历不存在') return fail(404, msg)
    if (msg === '无权在此日历下创建日程') return fail(403, msg)
    if (msg === '结束时间须晚于开始时间') return fail(400, msg)
    console.error('[POST /api/calendar-events]', e)
    return fail(500, msg)
  }
}
