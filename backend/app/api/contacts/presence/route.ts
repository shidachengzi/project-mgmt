import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { listOnlineUserIdsBySession } from '@/modules/contacts/contactPresenceService'

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  try {
    const data = await listOnlineUserIdsBySession()
    return ok(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '在线状态加载失败'
    console.error('[GET /api/contacts/presence]', e)
    return fail(500, msg)
  }
}
