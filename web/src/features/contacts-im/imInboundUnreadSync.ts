import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { fetchImInboundRecent } from '../../shared/api/imInboundRecentApi'
import { useContactImUnreadStore } from './contactImUnreadStore'
import { loadImThread } from './contactLocalImStorage'
import { notifyIncomingImMessage } from './imDesktopNotification'
import { getActiveImPeerIdForUnread } from './imActivePeer'

const NOTIFY_KEY = 'pm-im-inbound-notify-ids'

function loadNotified(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(NOTIFY_KEY)
    if (!raw) return new Set()
    const a = JSON.parse(raw) as unknown
    if (!Array.isArray(a)) return new Set()
    return new Set(a.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function saveNotified(ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify([...ids].slice(-2500)))
  } catch {
    // ignore
  }
}

/**
 * 拉取近期「发给我」的会话记录，与本地线程对比后补未读徽标（对端离线时仅靠 Socket 不会 increment）。
 * 依赖服务端近 48h 内的入库消息；已用 clientMsgId 去重，避免重复加未读。
 */
export async function syncInboundUnreadForBadge(): Promise<void> {
  if (!isBackendAuthEnabled() || typeof window === 'undefined') return
  if (!useAuthStore.getState().authedUserId) return

  const res = await fetchImInboundRecent(150)
  if (!res.ok || !res.data.length) return

  const notified = loadNotified()
  const active = getActiveImPeerIdForUnread()

  for (const row of res.data) {
    const id = row.clientMsgId
    const peerId = row.fromUserId
    if (!peerId || !id) continue
    if (notified.has(id)) continue

    const local = loadImThread(peerId)
    if (local.some(m => m.id === id)) {
      notified.add(id)
      continue
    }
    if (active === peerId) {
      notified.add(id)
      continue
    }
    useContactImUnreadStore.getState().increment(peerId)
    notifyIncomingImMessage({
      fromUserId: peerId,
      clientMsgId: id,
      text: typeof row.text === 'string' ? row.text : '',
      hasAttachment: Boolean(row.attachmentUrl?.trim()),
    })
    notified.add(id)
  }
  saveNotified(notified)
}
