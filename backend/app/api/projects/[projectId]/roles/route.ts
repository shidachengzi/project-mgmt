import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireProjectPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { createProjectRole, listProjectRolesWithPermissions } from '@/modules/project-rbac/service'

const postSchema = z.object({
  key: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(191),
  note: z.union([z.string().max(191), z.null()]).optional(),
})

export async function GET(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const { projectId } = await context.params
  const allowed = await requireProjectPermission(auth, projectId, '项目权限::角色管理')
  if (allowed !== true) return allowed
  return ok(await listProjectRolesWithPermissions(projectId))
}

export async function POST(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const { projectId } = await context.params
  const allowed = await requireProjectPermission(auth, projectId, '项目权限::角色管理')
  if (allowed !== true) return allowed

  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')

  const key = parsed.data.key ?? `custom-${Date.now()}`
  const result = await createProjectRole(projectId, {
    key,
    name: parsed.data.name,
    note: parsed.data.note,
  })
  if ('error' in result) {
    if (result.error === 'DUPLICATE_KEY') return fail(400, '角色 key 已存在')
    if (result.error === 'INVALID_INPUT') return fail(400, '名称无效')
  }
  return ok(result.role)
}

