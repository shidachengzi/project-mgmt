import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { updateMember } from '@/modules/org/adminOrgService'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  employeeCode: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  status: z.enum(['active', 'disabled']).optional(),
})

export async function PATCH(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'member.manage')
  if (allowed !== true) return allowed
  const { userId } = await context.params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const result = await updateMember(userId, parsed.data)
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '用户不存在')
    if (result.error === 'INVALID') return fail(400, '登录用户名不能为空')
    if (result.error === 'DEPT_NOT_FOUND') return fail(404, '部门不存在')
    if (result.error === 'DUPLICATE') return fail(409, '用户名、邮箱或手机号与其他用户冲突')
  }
  return ok({ ok: true })
}
