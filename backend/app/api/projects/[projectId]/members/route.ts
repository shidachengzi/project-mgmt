import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireProjectPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { buildProjectPermissionKey } from '@/lib/permissionMap'
import { listProjectMembers } from '@/modules/projects/projectCatalog'
import { notifyUserJoinedProject } from '@/modules/notifications/userNotificationService'
import { assignProjectMemberRole } from '@/modules/project-rbac/service'

const postSchema = z.object({
  userId: z.string().min(1),
  roleKey: z.string().min(1).optional(),
})

export async function GET(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const { projectId } = await context.params
  const result = await listProjectMembers(projectId, auth.userId)
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '项目不存在')
    if (result.error === 'FORBIDDEN') return fail(403, '无权查看该项目成员')
  }
  return ok(result.members)
}

export async function POST(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const { projectId } = await context.params
  const perm = buildProjectPermissionKey('项目权限', '成员管理')
  const allowed = await requireProjectPermission(auth, projectId, perm)
  if (allowed !== true) return allowed

  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const roleKey = parsed.data.roleKey ?? 'normal'

  const result = await assignProjectMemberRole(projectId, parsed.data.userId, roleKey)
  if ('error' in result) {
    if (result.error === 'ROLE_NOT_FOUND') return fail(404, '项目角色不存在')
    return fail(500, '分配失败')
  }
  if (result.wasNewMember) {
    void notifyUserJoinedProject({
      projectId,
      userId: parsed.data.userId,
      actorUserId: auth.userId,
    }).catch((e) => console.error('[notifyUserJoinedProject]', e))
  }
  return ok(result)
}
