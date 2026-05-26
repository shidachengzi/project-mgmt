import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { deleteUserCalendar, updateUserCalendar } from '@/modules/calendar/calendarService'

const patchSchema = z
  .object({
    name: z.string().min(1).max(191).optional(),
    color: z.string().min(1).max(32).optional(),
    visibility: z.enum(['private', 'team']).optional(),
    memberIds: z.array(z.string().min(1)).optional(),
    memberAccess: z.record(z.string().min(1), z.enum(['editor', 'viewer'])).optional(),
  })
  .strict()

export async function PATCH(req: NextRequest, context: { params: Promise<{ calendarId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const { calendarId } = await context.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail(400, '请求体须为 JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数无效', { issues: parsed.error.flatten() })
  if (Object.keys(parsed.data).length === 0) return fail(400, '无可更新的字段')

  const vis = parsed.data.visibility
  if (vis === 'team') {
    const allowed = await requireSystemPermission(auth, 'calendar.create_public')
    if (allowed !== true) return allowed
  }
  if (vis === 'private') {
    const allowed = await requireSystemPermission(auth, 'calendar.create_private')
    if (allowed !== true) return allowed
  }

  try {
    const data = await updateUserCalendar({
      actorUserId: auth.userId,
      calendarId,
      name: parsed.data.name,
      color: parsed.data.color,
      visibility: parsed.data.visibility,
      memberIds: parsed.data.memberIds,
      memberAccess: parsed.data.memberAccess,
    })
    return ok(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '更新日历失败'
    if (msg === '日历不存在') return fail(404, msg)
    if (msg === '只有日历所有者可以修改') return fail(403, msg)
    if (msg === '日历名称已存在') return fail(409, msg)
    console.error('[PATCH /api/calendars/:calendarId]', e)
    return fail(500, msg)
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ calendarId: string }> }) {
  const auth = requireAuth(_req)
  if (auth instanceof Response) return auth
  const { calendarId } = await context.params
  try {
    await deleteUserCalendar({ actorUserId: auth.userId, calendarId })
    return ok({ deleted: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '删除日历失败'
    if (msg === '日历不存在') return fail(404, msg)
    if (msg === '只有日历所有者可以删除') return fail(403, msg)
    console.error('[DELETE /api/calendars/:calendarId]', e)
    return fail(500, msg)
  }
}
