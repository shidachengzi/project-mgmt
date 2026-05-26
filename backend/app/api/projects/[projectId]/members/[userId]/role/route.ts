import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireProjectPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { assignProjectMemberRole } from '@/modules/project-rbac/service'

const bodySchema = z.object({
  roleKey: z.string().min(1),
})

export async function PUT(req: NextRequest, context: { params: Promise<{ projectId: string; userId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const { projectId, userId } = await context.params
  const allowed = await requireProjectPermission(auth, projectId, '项目权限::成员管理')
  if (allowed !== true) return allowed

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const result = await assignProjectMemberRole(projectId, userId, parsed.data.roleKey)
  if ('error' in result) {
    if (result.error === 'ROLE_NOT_FOUND') return fail(404, '项目角色不存在')
  }
  return ok(result)
}

