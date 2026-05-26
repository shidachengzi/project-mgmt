/**
 * 独立 IM 进程（`npm run dev:im-socket`，或与 API 一并 `npm run dev:stack`）
 * - 连接后加入 `u:{userId}`，向对方 `u:{peerId}` 推送，无需双方打开抽屉。
 * - 消息先落库（MySQL `im_direct_messages`）再投递；对端在线则实时 emit，离线则打开对话时由 GET /api/im/thread 拉取合并。
 * - 启动时及之后每 24h 按 IM_RETENTION_DAYS（默认 30）清理过期 IM 行；IM_PRUNE_ON_START=false 可关闭。
 * - 鉴权：Cookie `pm_access_token`
 */
import './loadImSocketEnv'
import * as http from 'http'
import * as cookie from 'cookie'
import { Server } from 'socket.io'
import { verifyAccessToken } from '../lib/auth'
import { ACCESS_COOKIE_KEY } from '../lib/cookies'
import { createImDirectMessage, deleteImDirectMessagesOlderThanDays } from '../modules/im/imDirectMessageService'
import { scheduleDeadlineReminderTicks } from '../modules/notifications/deadlineReminderScheduler'

const PORT = Number(process.env.IM_SOCKET_PORT || 3001)

/** 库中 IM 消息保留天数，默认 30（约 1 个月）；IM_PRUNE_ON_START=false 时本进程不做定时清理（可改用 npm run db:prune-im + 计划任务） */
const IM_RETENTION_DAYS = Math.max(1, Math.min(3650, Number(process.env.IM_RETENTION_DAYS) || 30))
const IM_PRUNE_ON_START = process.env.IM_PRUNE_ON_START !== 'false'

function userRoom(userId: string) {
  return `u:${userId}`
}

function userIdFromHandshake(handshake: { headers: http.IncomingHttpHeaders }): string | null {
  try {
    const raw = handshake.headers.cookie
    if (!raw || typeof raw !== 'string') return null
    const parsed = cookie.parse(raw)
    const tok = parsed[ACCESS_COOKIE_KEY]
    if (!tok) return null
    const p = verifyAccessToken(tok)
    if (p.type !== 'access') return null
    return p.sub
  } catch {
    return null
  }
}

const MAX_TEXT = 8000

/** 同一用户多标签页：仅当连接数为 0 时视为离线 */
const imConnectionCountByUser = new Map<string, number>()

function recipientConnectionCount(userId: string): number {
  return imConnectionCountByUser.get(userId) ?? 0
}

function isRecipientOnline(recipientId: string): boolean {
  return recipientConnectionCount(recipientId) > 0
}

function listOnlineUserIdsFromCounts(): string[] {
  return [...imConnectionCountByUser.entries()].filter(([, n]) => n > 0).map(([id]) => id)
}

const httpServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('project-mgmt IM socket (socket.io)\n')
})

const io = new Server(httpServer, {
  path: '/socket.io/',
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})

io.use((socket, next) => {
  const uid = userIdFromHandshake(socket.handshake)
  if (!uid) {
    next(new Error('unauthorized'))
    return
  }
  socket.data.userId = uid
  next()
})

io.on('connection', socket => {
  const userId = socket.data.userId as string

  const nextCount = (imConnectionCountByUser.get(userId) ?? 0) + 1
  imConnectionCountByUser.set(userId, nextCount)

  void socket.join(userRoom(userId))

  socket.emit('presence:snapshot', { userIds: listOnlineUserIdsFromCounts() })

  if (nextCount === 1) {
    io.emit('presence:update', { userId, online: true })
  }

  socket.on('disconnect', () => {
    const cur = imConnectionCountByUser.get(userId) ?? 1
    const left = cur - 1
    if (left <= 0) {
      imConnectionCountByUser.delete(userId)
      io.emit('presence:update', { userId, online: false })
    } else {
      imConnectionCountByUser.set(userId, left)
    }
  })

  /** 兼容旧客户端：加入用户房后不再需要 DM 房即可收发 */
  socket.on('im:join', (payload: { peerId?: string }) => {
    void payload
  })

  socket.on('im:leave', (payload: { peerId?: string }) => {
    void payload
  })

  socket.on(
    'im:message',
    (
      payload: {
        peerId?: string
        clientMsgId?: string
        text?: string
        ts?: number
        attachmentUrl?: string
        attachmentName?: string
        attachmentSize?: number
        mimeType?: string
      },
      ack?: (e?: string) => void,
    ) => {
      void (async () => {
        const peerId = typeof payload?.peerId === 'string' ? payload.peerId.trim() : ''
        const clientMsgId = typeof payload?.clientMsgId === 'string' ? payload.clientMsgId.trim() : ''
        const text = typeof payload?.text === 'string' ? payload.text : ''
        const ts = typeof payload?.ts === 'number' && Number.isFinite(payload.ts) ? payload.ts : Date.now()
        const attachmentUrl =
          typeof payload?.attachmentUrl === 'string' ? payload.attachmentUrl.trim().slice(0, 1024) : ''
        const attachmentName =
          typeof payload?.attachmentName === 'string' ? payload.attachmentName.trim().slice(0, 255) : ''
        const attachmentSize =
          typeof payload?.attachmentSize === 'number' && Number.isFinite(payload.attachmentSize)
            ? Math.floor(payload.attachmentSize)
            : undefined
        const mimeType = typeof payload?.mimeType === 'string' ? payload.mimeType.trim().slice(0, 128) : ''

        if (!peerId || peerId === userId || !clientMsgId) {
          ack?.('invalid_payload')
          return
        }
        const hasFile = Boolean(attachmentUrl)
        const trimmed = text.trim()
        if (!hasFile && !trimmed) {
          ack?.('empty')
          return
        }
        if (trimmed.length > MAX_TEXT) {
          ack?.('too_long')
          return
        }

        const saved = await createImDirectMessage({
          fromUserId: userId,
          toUserId: peerId,
          clientMsgId,
          text: trimmed,
          attachmentUrl: hasFile ? attachmentUrl : null,
          attachmentName: hasFile ? attachmentName || null : null,
          attachmentSize: hasFile ? attachmentSize : null,
          mimeType: hasFile ? mimeType || null : null,
        })
        if (saved.ok === false && saved.code === 'error') {
          ack?.('persist_failed')
          return
        }

        const outbound = {
          peerId: userId,
          clientMsgId,
          text: trimmed,
          ts,
          fromUserId: userId,
          ...(hasFile
            ? {
                attachmentUrl,
                attachmentName: attachmentName || undefined,
                attachmentSize,
                mimeType: mimeType || undefined,
              }
            : {}),
        }
        /** 落库成功或幂等重复：在线则推送（客户端按 clientMsgId 去重） */
        if (isRecipientOnline(peerId)) {
          io.to(userRoom(peerId)).emit('im:message', outbound)
        }
        ack?.()
      })()
    },
  )

  /** 对端已浏览会话（用于「已读」回执，不落库） */
  socket.on('im:read', (payload: { peerId?: string; upToTs?: number }) => {
    const peerId = typeof payload?.peerId === 'string' ? payload.peerId.trim() : ''
    if (!peerId || peerId === userId) return
    const upToTs =
      typeof payload?.upToTs === 'number' && Number.isFinite(payload.upToTs) ? payload.upToTs : Date.now()
    io.to(userRoom(peerId)).emit('im:read', { fromUserId: userId, upToTs })
  })
})

httpServer.listen(PORT, () => {
  console.log(`[im-socket] listening on http://localhost:${PORT}  (path /socket.io/)  persist=mysql`)

  async function runRetentionPrune() {
    try {
      const n = await deleteImDirectMessagesOlderThanDays(IM_RETENTION_DAYS)
      console.log(`[im-socket] retention: deleted ${n} rows older than ${IM_RETENTION_DAYS}d`)
    } catch (err) {
      console.error('[im-socket] retention prune failed', err)
    }
  }

  if (IM_PRUNE_ON_START) {
    void runRetentionPrune()
    const dayMs = 24 * 60 * 60 * 1000
    setInterval(() => void runRetentionPrune(), dayMs)
  }

  if (process.env.DEADLINE_REMINDER_IN_IM !== 'false') {
    scheduleDeadlineReminderTicks()
    console.log('[im-socket] deadline reminder scan scheduled (set DEADLINE_REMINDER_IN_IM=false to disable)')
  }
})
