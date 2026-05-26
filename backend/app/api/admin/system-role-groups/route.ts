import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { createSystemRoleGroup } from '@/modules/org/systemRoleAdminService'

const postSchema = z.object({
  name: z.string().min(1),
  key: z.string().max(64).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'role.manage')
  if (allowed !== true) return allowed

  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')

  const result = await createSystemRoleGroup(parsed.data)
  if ('error' in result) {
    if (result.error === 'EMPTY_NAME') return fail(400, '分组名称不能为空')
    if (result.error === 'RESERVED_NAME') return fail(400, '不能使用该分组名称')
    if (result.error === 'INVALID_KEY') return fail(400, '分组标识无效')
    if (result.error === 'RESERVED_KEY') return fail(400, '不能使用该分组标识')
    if (result.error === 'DUPLICATE_KEY') return fail(409, '分组标识已存在')
  }
  return ok({ key: result.group.key, name: result.group.name })
}
