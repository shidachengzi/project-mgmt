import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { loadImThread, saveImThread, type ImMsg } from './contactLocalImStorage'
import { useContactImReadReceiptStore } from './contactImReadReceiptStore'
import { useContactImUnreadStore } from './contactImUnreadStore'
import { useContactSocketPresenceStore } from './contactSocketPresenceStore'
import { getActiveImPeerIdForUnread } from './imActivePeer'
import { syncInboundUnreadForBadge } from './imInboundUnreadSync'
import { notifyIncomingImMessage, tryRequestImNotificationPermission } from './imDesktopNotification'

let socket: Socket | null = null

let imInboundHandler: ((p: ImSocketInbound) => void) | null = null
let imReadHandler: ((p: ImReadInbound) => void) | null = null
let presenceSnapshotHandler: ((p: PresenceSnapshot) => void) | null = null
let presenceUpdateHandler: ((p: PresenceUpdate) => void) | null = null

type PresenceSnapshot = { userIds: string[] }
type PresenceUpdate = { userId: string; online: boolean }
type ImReadInbound = { fromUserId: string; upToTs: number }

function attachPresenceHandlers(s: Socket) {
  if (!presenceSnapshotHandler) {
    presenceSnapshotHandler = (p: PresenceSnapshot) => {
      const ids = Array.isArray(p?.userIds) ? p.userIds : []
      useContactSocketPresenceStore.getState().setPresenceSnapshot(ids)
    }
  }
  if (!presenceUpdateHandler) {
    presenceUpdateHandler = (p: PresenceUpdate) => {
      if (!p?.userId) return
      useContactSocketPresenceStore.getState().setSocketPresence(p.userId, Boolean(p.online))
    }
  }
  s.off('presence:snapshot', presenceSnapshotHandler)
  s.on('presence:snapshot', presenceSnapshotHandler)
  s.off('presence:update', presenceUpdateHandler)
  s.on('presence:update', presenceUpdateHandler)
}

function attachImInboundHandler(s: Socket) {
  if (!imInboundHandler) {
    imInboundHandler = (p: ImSocketInbound) => {
      const me = useAuthStore.getState().authedUserId
      if (!me || p.fromUserId === me) return
      const peerId = p.fromUserId
      const prev = loadImThread(peerId)
      if (prev.some(m => m.id === p.clientMsgId)) return
      const row: ImMsg = {
        id: p.clientMsgId,
        from: 'peer',
        text: typeof p.text === 'string' ? p.text : '',
        ts: p.ts,
        ...(p.attachmentUrl
          ? {
              attachmentUrl: p.attachmentUrl,
              attachmentName: p.attachmentName,
              attachmentSize: p.attachmentSize,
              mimeType: p.mimeType,
            }
          : {}),
      }
      const next = [...prev, row].sort((a, b) => a.ts - b.ts)
      saveImThread(peerId, next)
      if (getActiveImPeerIdForUnread() !== peerId) {
        useContactImUnreadStore.getState().increment(peerId)
      }
      notifyIncomingImMessage({
        fromUserId: peerId,
        clientMsgId: p.clientMsgId,
        text: row.text,
        hasAttachment: Boolean(p.attachmentUrl),
      })
      window.dispatchEvent(new CustomEvent('pm-im-thread-updated', { detail: { peerId } }))
    }
  }
  s.off('im:message', imInboundHandler)
  s.on('im:message', imInboundHandler)
}

function attachImReadHandler(s: Socket) {
  if (!imReadHandler) {
    imReadHandler = (p: ImReadInbound) => {
      if (!p?.fromUserId) return
      const ts = typeof p.upToTs === 'number' && Number.isFinite(p.upToTs) ? p.upToTs : Date.now()
      useContactImReadReceiptStore.getState().applyReadFromPeer(p.fromUserId, ts)
    }
  }
  s.off('im:read', imReadHandler)
  s.on('im:read', imReadHandler)
}

function attachAllHandlers(s: Socket) {
  attachPresenceHandlers(s)
  attachImInboundHandler(s)
  attachImReadHandler(s)
}

/** 独立 Socket 进程 origin；不设则开发环境走当前页 + Vite 代理 */
export function resolveImSocketOrigin(): string {
  const base = import.meta.env.VITE_IM_SOCKET_BASE?.trim()
  if (base) return base.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function getImSocket(): Socket | null {
  if (!isBackendAuthEnabled()) return null
  if (typeof window === 'undefined') return null
  if (socket?.connected) {
    attachAllHandlers(socket)
    return socket
  }
  if (socket && !socket.connected) {
    attachAllHandlers(socket)
    socket.connect()
    return socket
  }
  const origin = resolveImSocketOrigin()
  socket = io(origin, {
    path: '/socket.io/',
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1200,
  })
  attachAllHandlers(socket)
  socket.on('connect', () => {
    if (!socket) return
    attachAllHandlers(socket)
    /** 连接已建立即视为本账号在线（与 snapshot 一致；避免极端时序下无绿点） */
    const me = useAuthStore.getState().authedUserId
    if (me) useContactSocketPresenceStore.getState().setSocketPresence(me, true)
    void syncInboundUnreadForBadge()
  })
  socket.on('connect_error', err => {
    console.warn('[im-socket] connect_error', err?.message ?? err)
  })
  return socket
}

/** 登录后尽早建立连接，便于未打开抽屉时收实时消息 */
export function initImSocketWhenAuthed() {
  if (!isBackendAuthEnabled()) return
  tryRequestImNotificationPermission()
  getImSocket()
  void syncInboundUnreadForBadge()
}

export function disconnectImSocket() {
  try {
    if (socket) {
      if (imInboundHandler) socket.off('im:message', imInboundHandler)
      if (imReadHandler) socket.off('im:read', imReadHandler)
      if (presenceSnapshotHandler) socket.off('presence:snapshot', presenceSnapshotHandler)
      if (presenceUpdateHandler) socket.off('presence:update', presenceUpdateHandler)
    }
    socket?.disconnect()
  } finally {
    socket = null
  }
}

export function teardownImSocketForLogout() {
  useContactSocketPresenceStore.getState().clearSocketPresence()
  disconnectImSocket()
}

export type ImSocketInbound = {
  peerId: string
  clientMsgId: string
  text: string
  ts: number
  fromUserId: string
  attachmentUrl?: string
  attachmentName?: string
  attachmentSize?: number
  mimeType?: string
}

/** 通知对方「我已浏览到该时间戳为止的会话」用于已读回执 */
export function emitImReadReceipt(peerId: string, upToTs: number) {
  const s = getImSocket()
  if (!s?.connected) return
  s.emit('im:read', { peerId, upToTs })
}

/** 拉近期发给我的消息并补未读徽标（进入通讯录等场景可主动调） */
export function requestInboundUnreadSync() {
  void syncInboundUnreadForBadge()
}
