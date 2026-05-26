import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/guards'
import { ok } from '@/lib/http'
import { unreadSummaryForUser } from '@/modules/notifications/userNotificationService'

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const data = await unreadSummaryForUser(auth.userId)
  return ok(data)
}
