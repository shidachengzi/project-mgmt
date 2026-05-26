import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireProjectPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { updateProjectRolePermissions } from '@/modules/project-rbac/service'

const bodySchema = z.object({
  permissionKeys: z.array(z.string()).default([]),
})

export async function PUT(req: NextRequest, context: { params: Promise<{ projectId: string; roleId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const { projectId, roleId } = await context.params
  const allowed = await requireProjectPermission(auth, projectId, '项目权限::角色管理')
  if (allowed !== true) return allowed

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const result = await updateProjectRolePermissions(projectId, roleId, parsed.data.permissionKeys)
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '项目角色不存在')
    if (result.error === 'FORBIDDEN_ROLE') return fail(400, 'admin 角色权限不可修改')
  }
  return ok(result)
}

