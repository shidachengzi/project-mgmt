import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type MyTaskItemDTO = {
  projectId: string
  projectTitle: string
  itemKey: string
  kind: 'target' | 'task'
  title: string
  status: string
  priority: string
  start: string | null
  end: string | null
  ownerUserId: string | null
  ownerName: string | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
  /** 与内联创建约定一致时用于卡片「任务类型」：`任务` / `部门会议` / 否则为模板项目任务名 */
  description: string | null
  /** 工作区参与人解析后的用户 id，用于筛选「参与人」 */
  participantUserIds: string[]
}

export type MyTaskScope = 'responsible' | 'participated' | 'created'

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function fetchMyTasks(
  scope: MyTaskScope,
): Promise<{ ok: true; data: MyTaskItemDTO[] } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/me/tasks?scope=${encodeURIComponent(scope)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<MyTaskItemDTO[]>(res)
}
