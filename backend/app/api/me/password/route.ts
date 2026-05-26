import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { changeOwnPassword } from '@/modules/me/meSelfAccountService'

const patchSchema = z.object({
  oldPassword: z.string().min(1).max(500),
  newPassword: z.string().min(6).max(200),
})

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')

  const r = await changeOwnPassword(auth.userId, parsed.data.oldPassword, parsed.data.newPassword)
  if ('error' in r) {
    if (r.error === 'NOT_FOUND') return fail(404, '用户不存在')
    if (r.error === 'BAD_OLD') return fail(400, '当前密码不正确')
    if (r.error === 'WEAK') return fail(400, '新密码至少 6 位')
  }

  return ok({ ok: true, message: '密码已修改，其它设备需重新登录' })
}
