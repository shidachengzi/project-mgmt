import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { listUserNotifications } from '@/modules/notifications/userNotificationService'

const querySchema = z.object({
  category: z.enum(['system', 'project']).optional(),
  type: z.string().min(1).max(32).optional(),
  read: z.enum(['all', 'read', 'unread']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const sp = req.nextUrl.searchParams
  const parsed = querySchema.safeParse({
    category: sp.get('category') ?? undefined,
    type: sp.get('type') ?? undefined,
    read: sp.get('read') ?? undefined,
    page: sp.get('page') ?? undefined,
    pageSize: sp.get('pageSize') ?? undefined,
  })
  if (!parsed.success) return fail(400, '参数错误')

  const data = await listUserNotifications({
    userId: auth.userId,
    category: parsed.data.category,
    type: parsed.data.type,
    read: parsed.data.read ?? 'all',
    page: parsed.data.page ?? 1,
    pageSize: parsed.data.pageSize ?? 10,
  })
  return ok(data)
}
