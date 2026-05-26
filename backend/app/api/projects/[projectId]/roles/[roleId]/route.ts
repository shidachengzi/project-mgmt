import { NextRequest } from 'next/server'
import { requireAuth, requireProjectPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { deleteProjectRole, setProjectDefaultRole } from '@/modules/project-rbac/service'

export async function PATCH(req: NextRequest, context: { params: Promise<{ projectId: string; roleId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const { projectId, roleId } = await context.params
  const allowed = await requireProjectPermission(auth, projectId, '项目权限::角色管理')
  if (allowed !== true) return allowed

  const result = await setProjectDefaultRole(projectId, roleId)
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '项目角色不存在')
  }
  return ok(result)
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ projectId: string; roleId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const { projectId, roleId } = await context.params
  const allowed = await requireProjectPermission(auth, projectId, '项目权限::角色管理')
  if (allowed !== true) return allowed

  const result = await deleteProjectRole(projectId, roleId)
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '项目角色不存在')
    if (result.error === 'BUILTIN_ROLE') return fail(400, '内置角色不可删除')
    if (result.error === 'NO_DEFAULT_ROLE') return fail(400, '未找到默认角色')
  }
  return ok(result)
}
