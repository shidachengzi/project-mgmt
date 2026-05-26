import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { appendUserAccessLog, listUserAccessLogsPaged, pickClientIp } from '@/modules/me/userAccessLogService'

const postSchema = z.object({
  path: z.string().min(1).max(512),
})

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || '1') || 1)
  const pageSizeRaw = Number(req.nextUrl.searchParams.get('pageSize') || '10') || 10
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw))

  try {
    const { items, total, page: p, pageSize: ps } = await listUserAccessLogsPaged(auth.userId, page, pageSize)
    return ok({ items, total, page: p, pageSize: ps })
  } catch (e) {
    console.error('[GET /api/me/access-logs]', e)
    const msg = e instanceof Error ? e.message : '读取失败'
    if (msg.includes('Unknown table') || msg.includes("doesn't exist")) {
      return fail(503, '数据库尚未创建访问日志表，请在后端执行迁移：npm run db:deploy')
    }
    return fail(500, msg)
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')

  try {
    await appendUserAccessLog({
      userId: auth.userId,
      path: parsed.data.path,
      userAgent: req.headers.get('user-agent'),
      ip: pickClientIp(req.headers),
    })
    return ok({ ok: true })
  } catch (e) {
    console.error('[POST /api/me/access-logs]', e)
    const msg = e instanceof Error ? e.message : '写入失败'
    if (msg.includes('Unknown table') || msg.includes("doesn't exist")) {
      return fail(503, '数据库尚未创建访问日志表，请在后端执行迁移：npm run db:deploy')
    }
    return fail(500, msg)
  }
}
