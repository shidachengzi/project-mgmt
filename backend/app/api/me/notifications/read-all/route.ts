import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { markAllNotificationsRead } from '@/modules/notifications/userNotificationService'

const bodySchema = z
  .object({
    category: z.enum(['system', 'project']).optional(),
    type: z.string().min(1).max(32).optional(),
  })
  .strict()

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body ?? {})
  if (!parsed.success) return fail(400, '参数错误')
  const data = await markAllNotificationsRead({
    userId: auth.userId,
    category: parsed.data.category,
    type: parsed.data.type,
  })
  return ok(data)
}
