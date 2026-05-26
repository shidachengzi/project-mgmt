import { NextRequest } from 'next/server'
import { fail, ok } from '@/lib/http'
import { runDeadlineReminderScan } from '@/modules/notifications/deadlineReminderScan'

/** 供外部计划任务触发；需配置 INTERNAL_CRON_SECRET，请求头 x-pm-cron-secret 与其一致 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_CRON_SECRET?.trim()
  if (!secret || secret.length < 8) return fail(503, '未配置 INTERNAL_CRON_SECRET')
  const h = req.headers.get('x-pm-cron-secret')?.trim()
  if (h !== secret) return fail(401, '未授权')
  try {
    const data = await runDeadlineReminderScan()
    return ok(data)
  } catch (e) {
    console.error('[deadline-reminders]', e)
    return fail(500, '扫描失败')
  }
}
