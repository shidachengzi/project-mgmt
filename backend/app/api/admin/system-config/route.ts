import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { hasSystemPermission } from '@/lib/rbac'
import { getAdminMailSnapshot } from '@/modules/admin/systemMailConfigService'

/** 具备「系统配置」系统权限的用户可读运行时配置快照（不含密钥） */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  if (!(await hasSystemPermission(auth.userId, 'system.config'))) {
    return fail(403, '无系统配置权限（需在系统角色中授予「系统配置」）')
  }

  const mail = await getAdminMailSnapshot()

  return ok({
    service: {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      deadlineReminderLeadMinutes: Number(process.env.DEADLINE_REMINDER_LEAD_MINUTES) || 10,
      deadlineReminderIntervalMs: Number(process.env.DEADLINE_REMINDER_INTERVAL_MS) || 60_000,
      deadlineReminderInIm: process.env.DEADLINE_REMINDER_IN_IM !== 'false',
      deadlineReminderInNext: process.env.DEADLINE_REMINDER_IN_NEXT === 'true',
      internalCronSecretSet: Boolean(process.env.INTERNAL_CRON_SECRET?.trim() && process.env.INTERNAL_CRON_SECRET.trim().length >= 8),
    },
    mail,
  })
}
