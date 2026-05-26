import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireMemberManageOrRoleManage, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { createMember, listMembers } from '@/modules/org/adminOrgService'

const postSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  email: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  employeeCode: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
})

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireMemberManageOrRoleManage(auth)
  if (allowed !== true) return allowed
  const q = req.nextUrl.searchParams.get('q') ?? undefined
  const members = await listMembers(q)
  return ok(members)
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'member.manage')
  if (allowed !== true) return allowed
  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const result = await createMember(parsed.data)
  if ('error' in result) {
    if (result.error === 'INVALID') return fail(400, '姓名、登录用户名与密码为必填')
    if (result.error === 'DEPT_NOT_FOUND') return fail(404, '部门不存在')
    if (result.error === 'DUPLICATE') return fail(409, '用户名、邮箱或手机号已存在')
  }
  return ok({ id: result.user.id })
}
