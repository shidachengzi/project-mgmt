import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { createJobTitle, listJobTitles } from '@/modules/org/adminJobTitleService'

const postSchema = z.object({
  name: z.string().min(1),
})

export async function GET(_req: NextRequest) {
  const auth = requireAuth(_req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'member.manage')
  if (allowed !== true) return allowed
  const list = await listJobTitles()
  return ok(list)
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'member.manage')
  if (allowed !== true) return allowed
  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const result = await createJobTitle(parsed.data.name)
  if ('error' in result) {
    if (result.error === 'EMPTY_NAME') return fail(400, '职位名称不能为空')
    if (result.error === 'DUPLICATE_NAME') return fail(409, '职位名称已存在')
  }
  return ok({ id: result.id })
}
