import { NextRequest } from 'next/server'
import { z } from 'zod'
import { fail, ok } from '@/lib/http'
import { verifyPasswordResetCode } from '@/modules/auth/passwordResetService'

const bodySchema = z.object({
  email: z.string().email().max(191),
  code: z.string().min(4).max(16),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return fail(400, '参数错误')

    const r = await verifyPasswordResetCode(parsed.data.email, parsed.data.code)
    if (!r.ok) {
      if (r.error === 'INVALID_EMAIL') return fail(400, '请输入有效的邮箱地址')
      return fail(400, '验证码错误或已过期')
    }

    return ok({ ok: true, resetToken: r.resetToken })
  } catch (e) {
    console.error('[auth/password-reset/verify]', e)
    const msg = e instanceof Error ? e.message : '服务器错误'
    return fail(500, msg)
  }
}
