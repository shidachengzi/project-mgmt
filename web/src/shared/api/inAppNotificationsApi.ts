import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type InAppNotificationCategory = 'system' | 'project'

export type InAppNotificationDTO = {
  id: string
  category: InAppNotificationCategory
  type: string
  title: string
  body: string | null
  read: boolean
  projectId: string | null
  taskId: string | null
  eventId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export const IN_APP_SYSTEM_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'maintenance', label: '维护公告' },
  { value: 'security', label: '安全提醒' },
  { value: 'announcement', label: '系统公告' },
] as const

export const IN_APP_PROJECT_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'project_member_added', label: '加入项目' },
  { value: 'task_owner_assigned', label: '任务负责人' },
  { value: 'target_owner_assigned', label: '目标负责人' },
  { value: 'task_participant_added', label: '任务参与人' },
  { value: 'target_participant_added', label: '目标参与人' },
  { value: 'project_overview_custom_reminder', label: '项目概览提醒' },
  { value: 'project_start_reminder', label: '项目即将开始' },
  { value: 'project_end_reminder', label: '项目即将截止' },
  { value: 'task_start_reminder', label: '任务即将开始' },
  { value: 'task_end_reminder', label: '任务即将截止' },
  { value: 'target_start_reminder', label: '目标即将开始' },
  { value: 'target_end_reminder', label: '目标即将截止' },
  { value: 'calendar_event', label: '日程' },
  { value: 'calendar_event_reminder', label: '日程提醒' },
] as const

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function fetchInAppUnreadSummary(): Promise<
  { ok: true; data: { system: number; project: number } } | { ok: false; message: string }
> {
  const url = resolveBackendUrl('/api/me/notifications/unread-summary')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson(res)
}

export async function fetchInAppNotifications(params: {
  category: InAppNotificationCategory
  type?: string
  read?: 'all' | 'read' | 'unread'
  page?: number
  pageSize?: number
}): Promise<{ ok: true; data: { items: InAppNotificationDTO[]; total: number } } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/me/notifications')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const sp = new URLSearchParams()
  sp.set('category', params.category)
  if (params.type) sp.set('type', params.type)
  if (params.read) sp.set('read', params.read)
  if (params.page) sp.set('page', String(params.page))
  sp.set('pageSize', String(params.pageSize ?? 10))
  const res = await sessionAwareFetch(`${url}?${sp.toString()}`, { credentials: 'include' })
  return parseJson(res)
}

export async function patchInAppNotificationRead(
  id: string,
): Promise<{ ok: true; data: { ok: boolean } } | { ok: false; message: string }> {
  const base = resolveBackendUrl(`/api/me/notifications/${encodeURIComponent(id)}/read`)
  if (!base) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(base, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return parseJson(res)
}

export async function postInAppNotificationsReadAll(body: {
  category?: InAppNotificationCategory
  type?: string
}): Promise<{ ok: true; data: { updated: number } } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/me/notifications/read-all')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function deleteInAppNotification(
  id: string,
): Promise<{ ok: true; data: { ok: boolean } } | { ok: false; message: string }> {
  const base = resolveBackendUrl(`/api/me/notifications/${encodeURIComponent(id)}`)
  if (!base) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(base, { method: 'DELETE', credentials: 'include' })
  return parseJson(res)
}

export async function postInAppNotificationsClearAll(body: {
  category?: InAppNotificationCategory
  type?: string
}): Promise<{ ok: true; data: { deleted: number } } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/me/notifications/clear-all')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function postAdminNotificationBroadcast(body: {
  type: 'maintenance' | 'security' | 'announcement'
  title: string
  body: string
}): Promise<{ ok: true; data: { count: number } } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/admin/notifications/broadcast')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}
