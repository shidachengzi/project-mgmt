import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { deleteCalendarEvent, updateCalendarEvent } from '@/modules/calendar/calendarService'

const reminderSchema = z.object({
  channel: z.string().min(1),
  value: z.number().int().min(1).max(9999),
  unit: z.string().min(1),
})

const patchSchema = z
  .object({
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

export async function PATCH(req: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const { eventId } = await context.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail(400, '请求体须为 JSON')
  }
  const parsed = patchSchema.safeParse(body)
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
    const data = await updateCalendarEvent({
      actorUserId: auth.userId,
      eventId,
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
    const msg = e instanceof Error ? e.message : '更新日程失败'
    if (msg === '日程不存在') return fail(404, msg)
    if (msg === '日历不存在') return fail(404, msg)
    if (msg === '无权修改此日程') return fail(403, msg)
    if (msg === '结束时间须晚于开始时间') return fail(400, msg)
    console.error('[PATCH /api/calendar-events/:eventId]', e)
    return fail(500, msg)
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const auth = requireAuth(_req)
  if (auth instanceof Response) return auth
  const { eventId } = await context.params
  try {
    await deleteCalendarEvent({ actorUserId: auth.userId, eventId })
    return ok({ deleted: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '删除日程失败'
    if (msg === '日程不存在') return fail(404, msg)
    if (msg === '日历不存在') return fail(404, msg)
    if (msg === '无权删除此日程') return fail(403, msg)
    console.error('[DELETE /api/calendar-events/:eventId]', e)
    return fail(500, msg)
  }
}
