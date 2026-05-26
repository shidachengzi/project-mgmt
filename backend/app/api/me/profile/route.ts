import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { patchOwnProfile } from '@/modules/me/meSelfAccountService'

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    username: z.string().trim().min(1).max(64).optional(),
    email: z.string().max(191).optional(),
    mobile: z.string().max(191).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.email !== undefined && d.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '邮箱格式无效', path: ['email'] })
    }
  })

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误', { issues: parsed.error.flatten() })

  const p = parsed.data
  if (p.name === undefined && p.username === undefined && p.email === undefined && p.mobile === undefined) {
    return fail(400, '请至少提供一个要修改的字段')
  }

  const patch: Parameters<typeof patchOwnProfile>[1] = {}
  if (p.name !== undefined) patch.name = p.name
  if (p.username !== undefined) patch.username = p.username.trim()
  if (p.email !== undefined) patch.email = p.email.trim() === '' ? null : p.email.trim()
  if (p.mobile !== undefined) patch.mobile = p.mobile.trim() === '' ? null : p.mobile.trim()

  const r = await patchOwnProfile(auth.userId, patch)
  if ('error' in r) {
    if (r.error === 'NOT_FOUND') return fail(404, '用户不存在')
    if (r.error === 'INVALID') return fail(400, '用户名不能为空')
    if (r.error === 'CONTACT_REQUIRED') return fail(400, '请至少保留邮箱或手机号之一')
    if (r.error === 'DUPLICATE') return fail(409, '用户名、邮箱或手机号已被其他账号占用')
  }

  return ok({ ok: true })
}
