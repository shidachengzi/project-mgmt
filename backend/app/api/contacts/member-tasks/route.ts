import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { hasSystemAdminOrAbove } from '@/lib/rbac'
import { listContactMemberTasks } from '@/modules/contacts/contactMemberTasksService'

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const { searchParams } = new URL(req.url)
  const targetUserId = searchParams.get('userId')?.trim()
  if (!targetUserId) return fail(400, '缺少 userId')

  if (auth.userId !== targetUserId) {
    const elevated = await hasSystemAdminOrAbove(auth.userId)
    if (!elevated) return fail(403, '无权限查看他人任务')
  }

  try {
    const data = await listContactMemberTasks(auth.userId, targetUserId)
    return ok(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '任务数据加载失败'
    console.error('[GET /api/contacts/member-tasks]', e)
    return fail(500, msg)
  }
}
