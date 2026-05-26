import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { listImThreadBetween } from '@/modules/im/imDirectMessageService'

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const peerId = new URL(req.url).searchParams.get('peerId')?.trim()
  if (!peerId) return fail(400, '缺少 peerId')
  if (peerId === auth.userId) return fail(400, '无效会话')

  try {
    const data = await listImThreadBetween(auth.userId, peerId)
    return ok(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '加载会话失败'
    console.error('[GET /api/im/thread]', e)
    return fail(500, msg)
  }
}
