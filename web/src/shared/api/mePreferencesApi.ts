import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type MyTasksBoardLayoutV2 = {
  todo: string[]
  today: string[]
  next: string[]
  later: string[]
}

export type UserPreferencesDTO = {
  myTasksBoardV2?: MyTasksBoardLayoutV2
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function fetchMePreferences(): Promise<{ ok: true; data: UserPreferencesDTO } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/me/preferences')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<UserPreferencesDTO>(res)
}

export async function patchMePreferences(
  patch: Pick<UserPreferencesDTO, 'myTasksBoardV2'>,
): Promise<{ ok: true; data: UserPreferencesDTO } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/me/preferences')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return parseJson<UserPreferencesDTO>(res)
}
