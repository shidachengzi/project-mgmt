import { resolveEffectiveSmtp } from '@/modules/admin/systemMailConfigService'

/** SMTP：优先数据库 `system_mail_config`（项目管理系统内保存的配置），否则环境变量 `SMTP_*`。 */

export type SendMailResult = { ok: true } | { ok: false; error: string }

/** @deprecated 使用 {@link isSmtpMailConfiguredAsync}；仅反映环境变量是否齐全（不含库内配置） */
export function isSmtpMailConfigured(): boolean {
  const host = process.env.SMTP_HOST?.trim()
  const from = process.env.SMTP_FROM?.trim()
  return Boolean(host && from)
}

export async function isSmtpMailConfiguredAsync(): Promise<boolean> {
  const cfg = await resolveEffectiveSmtp()
  return cfg !== null
}

export async function sendSmtpMail(input: { to: string; subject: string; text: string }): Promise<SendMailResult> {
  const cfg = await resolveEffectiveSmtp()
  if (!cfg) return { ok: false, error: 'SMTP_NOT_CONFIGURED' }

  try {
    const nodemailer = await import(/* webpackIgnore: true */ 'nodemailer')
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
      ...(cfg.tlsSkipVerify ? { tls: { rejectUnauthorized: false } } : {}),
    })
    await transporter.sendMail({
      from: cfg.from,
      to: input.to,
      subject: input.subject.slice(0, 200),
      text: input.text,
    })
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[smtp]', msg)
    return { ok: false, error: msg }
  }
}
