import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { listRecentInboundToUser } from '@/modules/im/imDirectMessageService'

/** 近期发给我的消息（用于离线未读徽标），默认近 48h 内最多 150 条 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const raw = new URL(req.url).searchParams.get('take')
  const take = Math.min(300, Math.max(10, Number(raw) || 150))

  try {
    const data = await listRecentInboundToUser(auth.userId, take)
    return ok(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '加载失败'
    console.error('[GET /api/im/inbound-recent]', e)
    return fail(500, msg)
  }
}
