import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

type MeUser = {
  id: string
  name: string
  username?: string | null
  email?: string | null
  mobile?: string | null
}

type ApiJsonBody<T> = { ok?: boolean; data?: T; error?: { message?: string } }

async function parseOk<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const raw = await res.text()
  let json: ApiJsonBody<T> | null = null
  try {
    json = raw ? (JSON.parse(raw) as ApiJsonBody<T>) : null
  } catch {
    return { ok: false, message: '响应解析失败' }
  }
  if (!res.ok || !json?.ok) {
    return { ok: false, message: json?.error?.message?.trim() || `请求失败 (${res.status})` }
  }
  return { ok: true, data: json.data as T }
}

export async function fetchBackendMe(): Promise<{ ok: true; user: MeUser } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/auth/me')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  const p = await parseOk<MeUser>(res)
  if (!p.ok) return p
  return { ok: true, user: p.data }
}

export async function fetchBackendPreferences(): Promise<
  { ok: true; prefs: { accountAvatarDataUrl?: string | null; myTasksBoardV2?: unknown } } | { ok: false; message: string }
> {
  const url = resolveBackendUrl('/api/me/preferences')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  const p = await parseOk<{ accountAvatarDataUrl?: string | null; myTasksBoardV2?: unknown }>(res)
  if (!p.ok) return p
  return { ok: true, prefs: p.data }
}

export type PatchAccountFields = {
  name?: string
  username?: string
  email?: string
  mobile?: string
}

export async function patchBackendAccountFields(
  body: PatchAccountFields,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/me/profile')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const p = await parseOk<{ ok: boolean }>(res)
  if (!p.ok) return p
  return { ok: true }
}

export async function patchBackendPassword(
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/me/password')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword, newPassword }),
  })
  const p = await parseOk<{ ok: boolean; message?: string }>(res)
  if (!p.ok) return p
  return { ok: true }
}

export async function patchBackendPreferencesAvatar(accountAvatarDataUrl: string | null): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/me/preferences')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountAvatarDataUrl }),
  })
  const p = await parseOk<unknown>(res)
  if (!p.ok) return p
  return { ok: true }
}

export type AccessLogRow = {
  id: string
  path: string
  userAgent: string | null
  ip: string | null
  createdAt: string
}

export async function fetchBackendAccessLogs(
  page: number,
  pageSize: number,
): Promise<{ ok: true; items: AccessLogRow[]; total: number; page: number; pageSize: number } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/me/access-logs?page=${page}&pageSize=${pageSize}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  const p = await parseOk<{ items: AccessLogRow[]; total: number; page: number; pageSize: number }>(res)
  if (!p.ok) return p
  return {
    ok: true,
    items: p.data.items ?? [],
    total: typeof p.data.total === 'number' ? p.data.total : 0,
    page: typeof p.data.page === 'number' ? p.data.page : page,
    pageSize: typeof p.data.pageSize === 'number' ? p.data.pageSize : pageSize,
  }
}

export async function postBackendAccessLog(path: string): Promise<void> {
  const url = resolveBackendUrl('/api/me/access-logs')
  if (!url) return
  const p = path.slice(0, 512)
  try {
    await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p }),
    })
  } catch {
    // ignore
  }
}
