import { NextRequest } from 'next/server'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { listReportProjectTaskSummaries } from '@/modules/reports/reportTaskSummaryService'

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const allowed = await requireSystemPermission(auth, 'project.report')
  if (allowed !== true) return allowed

  try {
    const data = await listReportProjectTaskSummaries(auth.userId)
    return ok(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '报表数据加载失败'
    console.error('[GET /api/reports/task-summary]', e)
    return fail(500, msg)
  }
}
