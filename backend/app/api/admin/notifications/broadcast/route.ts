import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { hasSystemPermission } from '@/lib/rbac'
import { broadcastSystemNotifications } from '@/modules/notifications/userNotificationService'

const postSchema = z
  .object({
    type: z.enum(['maintenance', 'security', 'announcement']),
    title: z.string().min(1).max(191),
    body: z.string().min(1).max(20000),
  })
  .strict()

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  if (!(await hasSystemPermission(auth.userId, 'notification.broadcast'))) {
    return fail(403, '无全员通知权限（需在系统角色中授予「全员通知」）')
  }

  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')

  const data = await broadcastSystemNotifications({
    type: parsed.data.type,
    title: parsed.data.title,
    body: parsed.data.body,
    createdByUserId: auth.userId,
  })
  return ok(data)
}
