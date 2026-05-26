import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { deleteJobTitle, updateJobTitle } from '@/modules/org/adminJobTitleService'

const patchSchema = z.object({
  name: z.string().min(1),
})

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'member.manage')
  if (allowed !== true) return allowed
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const result = await updateJobTitle(id, parsed.data.name)
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '职位不存在')
    if (result.error === 'EMPTY_NAME') return fail(400, '职位名称不能为空')
    if (result.error === 'DUPLICATE_NAME') return fail(409, '职位名称已存在')
  }
  return ok({ ok: true })
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(_req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'member.manage')
  if (allowed !== true) return allowed
  const { id } = await context.params
  const result = await deleteJobTitle(id)
  if ('error' in result && result.error === 'NOT_FOUND') return fail(404, '职位不存在')
  return ok({ ok: true })
}
