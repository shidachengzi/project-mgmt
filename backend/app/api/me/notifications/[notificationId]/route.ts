import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { deleteNotificationForUser } from '@/modules/notifications/userNotificationService'

export async function DELETE(req: NextRequest, context: { params: Promise<{ notificationId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const { notificationId } = await context.params
  if (!notificationId) return fail(400, '缺少通知 id')
  const res = await deleteNotificationForUser(auth.userId, notificationId)
  if ('error' in res) return fail(404, '通知不存在')
  return ok({ ok: true })
}
