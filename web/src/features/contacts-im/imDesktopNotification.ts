import { useOrgStore } from '../../entities/org/model/useOrgStore'
import { getActiveImPeerIdForUnread } from './imActivePeer'

const lastNotifyAtByPeer = new Map<string, number>()
const DEBOUNCE_MS = 2800

export function tryRequestImNotificationPermission(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'default') return
  void Notification.requestPermission()
}

function peerDisplayName(peerId: string): string {
  const m = useOrgStore.getState().members.find(x => x.id === peerId)
  return m?.name?.trim() || '联系人'
}

function buildPreview(text: string, hasAttachment: boolean): string {
  const t = (text || '').trim()
  if (t) return t.length > 160 ? `${t.slice(0, 160)}…` : t
  if (hasAttachment) return '[附件]'
  return '发来一条新消息'
}

/**
 * 桌面系统通知（需用户已授权 Notification）。
 * 正在查看与该人的对话时不弹；同一人短时间内多条合并防抖。
 */
export function notifyIncomingImMessage(opts: {
  fromUserId: string
  clientMsgId: string
  text: string
  hasAttachment?: boolean
}): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const peerId = opts.fromUserId
  if (!peerId) return

  if (getActiveImPeerIdForUnread() === peerId && document.visibilityState === 'visible') return

  const now = Date.now()
  const last = lastNotifyAtByPeer.get(peerId) ?? 0
  if (now - last < DEBOUNCE_MS) return
  lastNotifyAtByPeer.set(peerId, now)

  const name = peerDisplayName(peerId)
  const body = buildPreview(opts.text, Boolean(opts.hasAttachment))

  try {
    new Notification(name, {
      body,
      tag: `pm-im-${opts.clientMsgId}`,
      requireInteraction: false,
    })
  } catch {
    // 部分环境不支持
  }
}
