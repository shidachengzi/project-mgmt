import type { ImMsg } from '../../features/contacts-im/contactLocalImStorage'
import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type ImThreadRowDTO = {
  fromUserId: string
  toUserId: string
  clientMsgId: string
  text: string
  createdAt: string
  attachmentUrl?: string | null
  attachmentName?: string | null
  attachmentSize?: number | null
  mimeType?: string | null
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function fetchImThread(
  peerId: string,
): Promise<{ ok: true; data: ImThreadRowDTO[] } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/im/thread?peerId=${encodeURIComponent(peerId)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<ImThreadRowDTO[]>(res)
}

export function mergeServerThreadRows(selfId: string, local: ImMsg[], rows: ImThreadRowDTO[]): ImMsg[] {
  const byId = new Map<string, ImMsg>()
  for (const m of local) byId.set(m.id, m)
  for (const r of rows) {
    if (byId.has(r.clientMsgId)) continue
    const attUrl = r.attachmentUrl?.trim()
    byId.set(r.clientMsgId, {
      id: r.clientMsgId,
      from: r.fromUserId === selfId ? 'me' : 'peer',
      text: r.text,
      ts: new Date(r.createdAt).getTime(),
      ...(attUrl
        ? {
            attachmentUrl: attUrl,
            attachmentName: r.attachmentName ?? undefined,
            attachmentSize: r.attachmentSize ?? undefined,
            mimeType: r.mimeType ?? undefined,
          }
        : {}),
    })
  }
  return [...byId.values()].sort((a, b) => a.ts - b.ts)
}
