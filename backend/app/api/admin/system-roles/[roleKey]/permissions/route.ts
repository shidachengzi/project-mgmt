import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { replaceRolePermissions } from '@/modules/org/systemRoleAdminService'

const bodySchema = z.object({
  permissionKeys: z.array(z.string().min(1)),
})

export async function PUT(req: NextRequest, context: { params: Promise<{ roleKey: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'role.manage')
  if (allowed !== true) return allowed

  const { roleKey } = await context.params
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')

  const result = await replaceRolePermissions(roleKey, parsed.data.permissionKeys)
  if ('error' in result) {
    if (result.error === 'OWNER_FIXED') return fail(400, '所有者角色权限不可修改')
    if (result.error === 'ROLE_NOT_FOUND') return fail(404, '角色不存在')
    if (result.error === 'INVALID_PERMISSION') return fail(400, '包含无效的权限标识')
  }
  return ok({ ok: true })
}
