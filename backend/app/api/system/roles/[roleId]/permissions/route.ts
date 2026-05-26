import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { updateSystemRolePermissions } from '@/modules/system-rbac/service'

const bodySchema = z.object({
  permissionKeys: z.array(z.string()).default([]),
})

export async function PUT(req: NextRequest, context: { params: Promise<{ roleId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'role.manage')
  if (allowed !== true) return allowed

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')

  const { roleId } = await context.params
  const result = await updateSystemRolePermissions(roleId, parsed.data.permissionKeys)
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '系统角色不存在')
    if (result.error === 'FORBIDDEN_ROLE') return fail(400, 'owner 角色权限不可修改')
  }
  return ok(result)
}

