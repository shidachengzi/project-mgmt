import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type ContactMemberTaskItemDTO = {
  projectId: string
  projectTitle: string
  itemKey: string
  kind: string
  title: string
  status: string
  end: string
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function fetchContactMemberTasks(
  userId: string,
  opts?: { signal?: AbortSignal },
): Promise<{ ok: true; data: ContactMemberTaskItemDTO[] } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/contacts/member-tasks?userId=${encodeURIComponent(userId)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include', signal: opts?.signal })
  return parseJson<ContactMemberTaskItemDTO[]>(res)
}
