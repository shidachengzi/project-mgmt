import { NextRequest } from 'next/server'
import { z } from 'zod'
import { fail, ok } from '@/lib/http'
import { finalizePasswordReset } from '@/modules/auth/passwordResetService'

const bodySchema = z.object({
  resetToken: z.string().min(10),
  newPassword: z.string().min(1).max(200),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return fail(400, '参数错误')

    const r = await finalizePasswordReset(parsed.data.resetToken, parsed.data.newPassword)
    if (!r.ok) {
      if (r.error === 'WEAK_PASSWORD') return fail(400, '新密码至少 6 位')
      if (r.error === 'INVALID_TOKEN') return fail(400, '验证已失效，请重新获取验证码')
      return fail(400, '无法完成重置')
    }

    return ok({ ok: true, message: '密码已重置，请使用新密码登录' })
  } catch (e) {
    console.error('[auth/password-reset/finalize]', e)
    const msg = e instanceof Error ? e.message : '服务器错误'
    return fail(500, msg)
  }
}
