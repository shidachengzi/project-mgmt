import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { hasSystemPermission } from '@/lib/rbac'
import { isSmtpMailConfiguredAsync, sendSmtpMail } from '@/lib/smtpMail'

const postSchema = z.object({ to: z.string().email().max(191) }).strict()

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  if (!(await hasSystemPermission(auth.userId, 'system.config'))) {
    return fail(403, '无系统配置权限（需在系统角色中授予「系统配置」）')
  }

  if (!(await isSmtpMailConfiguredAsync())) {
    return fail(400, '未配置 SMTP（请在项目管理系统中保存邮件配置，或设置环境变量 SMTP_HOST、SMTP_FROM 等）')
  }

  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return fail(400, '请输入有效邮箱')

  const r = await sendSmtpMail({
    to: parsed.data.to,
    subject: '项目管理系统：邮件配置测试',
    text: '这是一封来自项目管理系统「系统配置 · 邮件」的测试邮件。若收到说明 SMTP 配置可用。',
  })
  if (!r.ok) return fail(502, r.error === 'SMTP_NOT_CONFIGURED' ? 'SMTP 未配置' : `发送失败：${r.error}`)
  return ok({ ok: true })
}
