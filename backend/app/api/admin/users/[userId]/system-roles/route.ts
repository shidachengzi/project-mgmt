import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { hasSystemPermission } from '@/lib/rbac'
import { setUserPrimarySystemRole } from '@/modules/org/systemRoleAdminService'

const bodySchema = z.object({
  roleKey: z.string().min(1).max(64),
})

export async function PUT(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const can =
    (await hasSystemPermission(auth.userId, 'member.manage')) ||
    (await hasSystemPermission(auth.userId, 'role.manage'))
  if (!can) return fail(403, '无权修改成员角色')

  const { userId } = await context.params
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')

  const result = await setUserPrimarySystemRole(auth.userId, userId, parsed.data.roleKey)
  if ('error' in result) {
    if (result.error === 'ONLY_OWNER_CAN_ASSIGN_OWNER') return fail(403, '仅所有者可分配所有者角色')
    if (result.error === 'ROLE_NOT_FOUND') return fail(404, '角色不存在')
    if (result.error === 'LAST_OWNER') return fail(400, '不能移除唯一的所有者')
  }
  return ok({ ok: true })
}
