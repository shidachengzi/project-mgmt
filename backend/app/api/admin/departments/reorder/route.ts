import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { reorderDepartments } from '@/modules/org/adminOrgService'

const bodySchema = z.object({
  parentId: z.string().nullable().optional(),
  orderedIds: z.array(z.string().min(1)),
})

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const allowed = await requireSystemPermission(auth, 'member.manage')
  if (allowed !== true) return allowed
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const result = await reorderDepartments({
    parentId: parsed.data.parentId ?? null,
    orderedIds: parsed.data.orderedIds,
  })
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '部门不存在')
    if (result.error === 'PARENT_MISMATCH') return fail(400, '部门不属于同一上级')
  }
  return ok({ ok: true })
}
