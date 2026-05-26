import type { ImThreadRowDTO } from './imThreadApi'
import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

/** 近期「发给我」的消息（默认服务端近 48h），用于离线未读徽标 */
export async function fetchImInboundRecent(
  take = 150,
): Promise<{ ok: true; data: ImThreadRowDTO[] } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/im/inbound-recent?take=${encodeURIComponent(String(take))}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<ImThreadRowDTO[]>(res)
}
