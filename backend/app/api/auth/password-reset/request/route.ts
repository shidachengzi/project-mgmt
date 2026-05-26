import { NextRequest } from 'next/server'
import { z } from 'zod'
import { fail, ok } from '@/lib/http'
import { requestPasswordResetCode } from '@/modules/auth/passwordResetService'

const bodySchema = z.object({
  email: z.string().email().max(191),
})

const PUBLIC_MSG = '若该邮箱已注册为登录账号，您将收到验证码邮件'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return fail(400, '参数错误')

    const r = await requestPasswordResetCode(parsed.data.email)
    if (!r.ok) {
      if (r.error === 'INVALID_EMAIL') return fail(400, '请输入有效的邮箱地址')
      if (r.error === 'SMTP_NOT_CONFIGURED') {
        return fail(503, '邮件服务未配置，请联系管理员在系统中配置 SMTP 后再试')
      }
      if (r.error === 'MAIL_SEND_FAILED') return fail(502, '邮件发送失败，请稍后重试')
    }

    return ok({ ok: true, message: PUBLIC_MSG })
  } catch (e) {
    console.error('[auth/password-reset/request]', e)
    const msg = e instanceof Error ? e.message : '服务器错误'
    return fail(500, msg)
  }
}
