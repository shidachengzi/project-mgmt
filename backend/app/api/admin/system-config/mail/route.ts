import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { hasSystemPermission } from '@/lib/rbac'
import { isSystemMailPrismaAvailable, upsertSystemMailConfig } from '@/modules/admin/systemMailConfigService'

const patchSchema = z
  .object({
    smtpHost: z.string().max(191).nullable(),
    smtpPort: z.number().int().min(1).max(65535),
    smtpSecure: z.boolean(),
    smtpTlsSkipVerify: z.boolean().optional().default(false),
    smtpFrom: z.string().max(191).nullable(),
    smtpUser: z.string().max(191).nullable(),
    authPass: z.string().max(500).optional(),
    clearAuthPass: z.boolean().optional(),
  })
  .strict()

/** 保存全局 SMTP 至数据库（需具备「系统配置」系统权限）；口令使用 SETTINGS_ENCRYPTION_SECRET 或 JWT_REFRESH_SECRET 派生密钥加密 */
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  if (!(await hasSystemPermission(auth.userId, 'system.config'))) {
    return fail(403, '无系统配置权限（需在系统角色中授予「系统配置」）')
  }
  if (!isSystemMailPrismaAvailable()) {
    return fail(
      503,
      '服务端 Prisma 未包含邮件配置表模型。请在 backend 目录执行 npm run db:generate，并执行数据库迁移（如 npm run db:deploy）',
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')

  const d = parsed.data
  const host = d.smtpHost?.trim() ?? ''
  const from = d.smtpFrom?.trim() ?? ''
  if (!host || !from) return fail(400, 'SMTP 服务器与发件人地址不能为空')

  try {
    await upsertSystemMailConfig({
      smtpHost: d.smtpHost?.trim() || null,
      smtpPort: d.smtpPort,
      smtpSecure: d.smtpSecure,
      smtpTlsSkipVerify: d.smtpTlsSkipVerify,
      smtpFrom: d.smtpFrom?.trim() || null,
      smtpUser: d.smtpUser?.trim() || null,
      authPass: d.authPass,
      clearAuthPass: d.clearAuthPass === true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Unknown table') || msg.includes('doesn\'t exist')) {
      return fail(503, '数据库尚未创建 system_mail_config 表，请先执行迁移：npm run db:deploy')
    }
    console.error('[upsertSystemMailConfig]', e)
    return fail(500, '保存失败')
  }

  return ok({ ok: true })
}
