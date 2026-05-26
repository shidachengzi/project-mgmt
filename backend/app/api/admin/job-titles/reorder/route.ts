import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { reorderJobTitles } from '@/modules/org/adminJobTitleService'

const bodySchema = z.object({
  orderedIds: z.array(z.string().min(1)),
})

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'member.manage')
  if (allowed !== true) return allowed
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const result = await reorderJobTitles(parsed.data.orderedIds)
  if ('error' in result && result.error === 'NOT_FOUND') return fail(400, '排序列表含无效职位')
  return ok({ ok: true })
}
