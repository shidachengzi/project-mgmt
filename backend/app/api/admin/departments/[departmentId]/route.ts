import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { deleteDepartment, updateDepartment } from '@/modules/org/adminOrgService'

const patchSchema = z.object({
  name: z.string().min(1),
})

export async function PATCH(req: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'member.manage')
  if (allowed !== true) return allowed
  const { departmentId } = await context.params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const result = await updateDepartment(departmentId, { name: parsed.data.name })
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '部门不存在')
    if (result.error === 'FORBIDDEN') return fail(403, '不能修改根节点')
    if (result.error === 'EMPTY_NAME') return fail(400, '部门名称不能为空')
  }
  return ok({ ok: true })
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
  const auth = requireAuth(_req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'member.manage')
  if (allowed !== true) return allowed
  const { departmentId } = await context.params
  const result = await deleteDepartment(departmentId)
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '部门不存在')
    if (result.error === 'FORBIDDEN') return fail(403, '不能删除根节点')
    if (result.error === 'HAS_CHILDREN') return fail(400, '请先删除子部门')
  }
  return ok({ ok: true })
}
