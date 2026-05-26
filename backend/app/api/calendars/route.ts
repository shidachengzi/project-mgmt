import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { createUserCalendar, listCalendarsForUser } from '@/modules/calendar/calendarService'

const postSchema = z
  .object({
    name: z.string().min(1).max(191),
    color: z.string().min(1).max(32),
    visibility: z.enum(['private', 'team']),
    memberIds: z.array(z.string().min(1)).optional().default([]),
    memberAccess: z.record(z.string().min(1), z.enum(['editor', 'viewer'])).optional(),
  })
  .strict()

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  try {
    const data = await listCalendarsForUser(auth.userId)
    return ok(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '读取日历失败'
    console.error('[GET /api/calendars]', e)
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

  const { visibility } = parsed.data
  if (visibility === 'team') {
    const allowed = await requireSystemPermission(auth, 'calendar.create_public')
    if (allowed !== true) return allowed
  } else {
    const allowed = await requireSystemPermission(auth, 'calendar.create_private')
    if (allowed !== true) return allowed
  }

  try {
    const data = await createUserCalendar({
      ownerUserId: auth.userId,
      name: parsed.data.name,
      color: parsed.data.color,
      visibility,
      memberIds: parsed.data.memberIds,
      memberAccess: parsed.data.memberAccess,
    })
    return ok(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '创建日历失败'
    if (msg === '日历名称已存在') return fail(409, msg)
    console.error('[POST /api/calendars]', e)
    return fail(500, msg)
  }
}
