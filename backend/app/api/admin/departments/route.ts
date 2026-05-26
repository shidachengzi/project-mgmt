import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireMemberManageOrRoleManage, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { createDepartment, getDepartmentTreeWrapped } from '@/modules/org/adminOrgService'

const postSchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().min(1),
})

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireMemberManageOrRoleManage(auth)
  if (allowed !== true) return allowed
  const tree = await getDepartmentTreeWrapped()
  return ok(tree)
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'member.manage')
  if (allowed !== true) return allowed
  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const result = await createDepartment({ parentId: parsed.data.parentId ?? null, name: parsed.data.name })
  if ('error' in result) {
    if (result.error === 'EMPTY_NAME') return fail(400, '部门名称不能为空')
    if (result.error === 'PARENT_NOT_FOUND') return fail(404, '上级部门不存在')
  }
  return ok({ id: result.department.id })
}
