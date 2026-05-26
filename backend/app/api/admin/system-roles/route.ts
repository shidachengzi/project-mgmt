import { NextRequest } from 'next/server'
import { z } from 'zod'
import { fail, ok } from '@/lib/http'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { hasSystemPermission } from '@/lib/rbac'
import { createCustomSystemRole, getSystemRolesAdminSnapshot } from '@/modules/org/systemRoleAdminService'

const postRoleSchema = z.object({
  name: z.string().min(1),
  groupKey: z.string().min(1).max(64),
  note: z.string().max(191).nullable().optional(),
  key: z.string().max(64).nullable().optional(),
})

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const can =
    (await hasSystemPermission(auth.userId, 'member.manage')) ||
    (await hasSystemPermission(auth.userId, 'role.manage'))
  if (!can) return fail(403, '无权限查看系统角色')
  const data = await getSystemRolesAdminSnapshot()
  return ok(data)
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'role.manage')
  if (allowed !== true) return allowed

  const body = await req.json().catch(() => null)
  const parsed = postRoleSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')

  const result = await createCustomSystemRole(parsed.data)
  if ('error' in result) {
    if (result.error === 'EMPTY_NAME') return fail(400, '角色名称不能为空')
    if (result.error === 'GROUP_KEY_REQUIRED') return fail(400, '请选择分组')
    if (result.error === 'GROUP_NOT_FOUND') return fail(404, '分组不存在')
    if (result.error === 'INVALID_KEY') return fail(400, '角色标识无效')
    if (result.error === 'RESERVED_ROLE_KEY') return fail(400, '不能使用内置角色标识')
    if (result.error === 'DUPLICATE_ROLE_KEY') return fail(409, '角色标识已存在')
  }
  return ok({ key: result.role.key })
}
