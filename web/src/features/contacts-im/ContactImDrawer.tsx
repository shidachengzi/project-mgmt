import { ExportOutlined, FileImageOutlined, PaperClipOutlined, SendOutlined, SmileOutlined } from '@ant-design/icons'
import { App, Button, Drawer, Empty, Input, Popover, Space, Typography, Upload } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import type { UploadProps } from 'antd'
import dayjs from 'dayjs'
import type { DragEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import type { OrgMember } from '../../entities/org/model/types'
import { fetchImThread, mergeServerThreadRows } from '../../shared/api/imThreadApi'
import { isBackendAuthEnabled, resolveBackendUrl } from '../../shared/api/backendClient'
import { sessionAwareFetch } from '../../shared/api/sessionAwareFetch'
import { useContactImReadReceiptStore } from './contactImReadReceiptStore'
import { useContactImUnreadStore } from './contactImUnreadStore'
import { loadImThread, saveImThread, type ImMsg } from './contactLocalImStorage'
import { emitImReadReceipt, getImSocket } from './imSocketClient'
import { tryRequestImNotificationPermission } from './imDesktopNotification'
import { setActiveImPeerIdForUnread } from './imActivePeer'
import { openExternalImChatIfConfigured } from './openExternalImChat'

export type ContactImDrawerProps = {
  open: boolean
  onClose: () => void
  peer: OrgMember | null
  selfName: string
}

const TIME_GAP_MS = 5 * 60 * 1000

/** 常用表情（无需额外依赖） */
const QUICK_EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '🥲', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😛', '😜', '🤔', '😏',
  '😒', '😔', '😢', '😭', '😤', '😠', '🤯', '😱', '🥳', '😎', '👍', '👎', '👏', '🙏', '💪', '🔥', '✨', '💯', '❤️', '🎉',
]

function imPublicAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const p = path.startsWith('/') ? path : `/${path}`
  return `${origin}${p}`
}

function isLikelyImage(m: ImMsg): boolean {
  const mime = (m.mimeType || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  const n = (m.attachmentName || '').toLowerCase()
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)
}

function formatTimeSeparator(ts: number): string {
  const d = dayjs(ts)
  const today = dayjs()
  if (d.isSame(today, 'day')) return d.format('HH:mm')
  if (d.isSame(today.subtract(1, 'day'), 'day')) return `昨天 ${d.format('HH:mm')}`
  if (d.isSame(today, 'year')) return d.format('M月D日 HH:mm')
  return d.format('YYYY年M月D日 HH:mm')
}

function needsTimeSeparator(prev: ImMsg | undefined, curr: ImMsg): boolean {
  if (!prev) return true
  if (dayjs(prev.ts).format('YYYY-MM-DD') !== dayjs(curr.ts).format('YYYY-MM-DD')) return true
  return curr.ts - prev.ts > TIME_GAP_MS
}

type ImRenderRow =
  | { kind: 'time'; key: string; ts: number }
  | { kind: 'msg'; key: string; msg: ImMsg }

function buildImRenderRows(msgs: ImMsg[]): ImRenderRow[] {
  const out: ImRenderRow[] = []
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    const prev = i > 0 ? msgs[i - 1] : undefined
    if (needsTimeSeparator(prev, m)) {
      out.push({ kind: 'time', key: `t-${m.ts}-${i}`, ts: m.ts })
    }
    out.push({ kind: 'msg', key: m.id, msg: m })
  }
  return out
}

function BubbleBody({ m }: { m: ImMsg }) {
  const hasFile = Boolean(m.attachmentUrl?.trim())
  const hasText = Boolean(m.text?.trim())
  const showImg = hasFile && isLikelyImage(m)

  if (!hasFile && !hasText) {
    return (
      <div className="wt-contact-im__bubble-text">
        <Typography.Text type="secondary">（空消息）</Typography.Text>
      </div>
    )
  }
  return (
    <div className="wt-contact-im__bubble-text">
      {showImg ? (
        <div style={{ marginBottom: hasText ? 8 : 0 }}>
          <a href={imPublicAssetUrl(m.attachmentUrl!)} target="_blank" rel="noopener noreferrer">
            <img
              src={imPublicAssetUrl(m.attachmentUrl!)}
              alt={m.attachmentName || '图片'}
              className="wt-contact-im__bubble-img"
            />
          </a>
        </div>
      ) : hasFile ? (
        <div style={{ marginBottom: hasText ? 8 : 0 }}>
          <Typography.Link href={imPublicAssetUrl(m.attachmentUrl!)} target="_blank" rel="noopener noreferrer">
            {m.attachmentName || '下载附件'}
          </Typography.Link>
          {typeof m.attachmentSize === 'number' && m.attachmentSize > 0 ? (
            <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
              （
              {m.attachmentSize >= 1024 * 1024
                ? `${(m.attachmentSize / (1024 * 1024)).toFixed(1)} MB`
                : `${(m.attachmentSize / 1024).toFixed(0)} KB`}
              ）
            </Typography.Text>
          ) : null}
        </div>
      ) : null}
      {hasText ? <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div> : null}
    </div>
  )
}

export function ContactImDrawer({ open, onClose, peer, selfName }: ContactImDrawerProps) {
  const { message } = App.useApp()
  const authedUserId = useAuthStore(s => s.authedUserId)
  const [draft, setDraft] = useState('')
  const [msgs, setMsgs] = useState<ImMsg[]>([])
  const [uploading, setUploading] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const dragDepthRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textAreaRef = useRef<TextAreaRef>(null)

  const hasExternal = useMemo(() => Boolean(import.meta.env.VITE_IM_CHAT_URL_TEMPLATE?.trim()), [])
  const useRealtime = Boolean(isBackendAuthEnabled() && authedUserId && peer && peer.id !== authedUserId)

  const peerReadUpTo = useContactImReadReceiptStore(s => (peer ? s.peerReadUpToTs[peer.id] ?? 0 : 0))

  useEffect(() => {
    if (open && peer && useRealtime) tryRequestImNotificationPermission()
  }, [open, peer?.id, useRealtime])

  useEffect(() => {
    if (!open || !peer) {
      setActiveImPeerIdForUnread(null)
      return
    }
    setActiveImPeerIdForUnread(peer.id)
    useContactImUnreadStore.getState().clear(peer.id)
    useContactImReadReceiptStore.getState().hydrate()
    return () => {
      setActiveImPeerIdForUnread(null)
    }
  }, [open, peer?.id])

  useEffect(() => {
    if (!open || !peer || !useRealtime) return
    const s = getImSocket()
    if (!s?.connected) return
    const list = msgs.length ? msgs : loadImThread(peer.id)
    const upToTs = list.length ? Math.max(...list.map(m => m.ts)) : Date.now()
    const id = window.setTimeout(() => emitImReadReceipt(peer.id, upToTs), 320)
    return () => clearTimeout(id)
  }, [open, peer?.id, useRealtime, msgs])

  useEffect(() => {
    if (!open || !peer) return
    let cancelled = false

    const run = async () => {
      let list = loadImThread(peer.id)
      if (cancelled) return
      setMsgs(list)
      if (useRealtime && authedUserId) {
        const res = await fetchImThread(peer.id)
        if (cancelled) return
        if (res.ok) {
          list = mergeServerThreadRows(authedUserId, list, res.data)
          setMsgs(list)
          saveImThread(peer.id, list)
        }
      }
    }
    void run()
    setDraft('')

    const onThreadUpdated = (e: Event) => {
      const ce = e as CustomEvent<{ peerId?: string }>
      if (ce.detail?.peerId === peer.id) setMsgs(loadImThread(peer.id))
    }
    window.addEventListener('pm-im-thread-updated', onThreadUpdated)
    return () => {
      cancelled = true
      window.removeEventListener('pm-im-thread-updated', onThreadUpdated)
    }
  }, [open, peer?.id, peer, useRealtime, authedUserId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, open])

  const renderRows = useMemo(() => buildImRenderRows(msgs), [msgs])

  const lastMyMsgId = useMemo(() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].from === 'me') return msgs[i].id
    }
    return null
  }, [msgs])

  const emitMessageRow = useCallback(
    (
      row: ImMsg,
      socketPayload: {
        peerId: string
        clientMsgId: string
        text: string
        ts: number
        attachmentUrl?: string
        attachmentName?: string
        attachmentSize?: number
        mimeType?: string
      },
    ) => {
      if (!peer) return
      setMsgs(prev => saveImThread(peer.id, [...prev, row]))
      if (!useRealtime) return
      const s = getImSocket()
      if (s?.connected) {
        s.emit('im:message', socketPayload, (err?: string) => {
          if (!peer) return
          setMsgs(prev => {
            const next = prev.map(x => (x.id === row.id ? { ...x, delivered: !err } : x))
            return saveImThread(peer.id, next)
          })
          if (err === 'persist_failed') message.warning('服务端保存失败，消息已保存在本地，可稍后重试发送')
          else if (err) message.warning(`发送未确认（${err}），消息已保存在本地）`)
          else message.success('消息已发送')
        })
      } else {
        setMsgs(prev => {
          const next = prev.map(x => (x.id === row.id ? { ...x, delivered: true } : x))
          return saveImThread(peer.id, next)
        })
        message.warning('即时通道未连接，消息已保存在本地')
      }
    },
    [message, peer, useRealtime],
  )

  const uploadFileAndSend = useCallback(
    async (file: File) => {
      if (!peer) return
      if (!useRealtime) {
        message.warning('请先登录后端并连接 IM')
        return
      }
      setUploading(true)
      try {
        const url = resolveBackendUrl('/api/im/upload')
        if (!url) {
          message.error('未配置后端地址')
          return
        }
        const fd = new FormData()
        fd.append('file', file)
        const res = await sessionAwareFetch(url, { method: 'POST', body: fd })
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean
          data?: { url: string; name: string; size: number; mimeType: string }
        } | null
        if (!res.ok || !j?.ok || !j.data?.url) {
          const errMsg =
            j && typeof j === 'object' && 'error' in j && j.error && typeof (j as { error: { message?: string } }).error.message === 'string'
              ? (j as { error: { message: string } }).error.message
              : '上传失败'
          message.error(errMsg)
          return
        }
        const { url: attUrl, name, size, mimeType } = j.data
        const caption = draft.trim()
        const clientMsgId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        const ts = Date.now()
        const row: ImMsg = {
          id: clientMsgId,
          from: 'me',
          text: caption,
          ts,
          delivered: useRealtime ? false : true,
          attachmentUrl: attUrl,
          attachmentName: name,
          attachmentSize: size,
          mimeType,
        }
        emitMessageRow(row, {
          peerId: peer.id,
          clientMsgId,
          text: caption,
          ts,
          attachmentUrl: attUrl,
          attachmentName: name,
          attachmentSize: size,
          mimeType,
        })
        setDraft('')
      } catch {
        message.error('上传失败')
      } finally {
        setUploading(false)
      }
    },
    [draft, emitMessageRow, message, peer, useRealtime],
  )

  const send = useCallback(() => {
    if (!peer) return
    const text = draft.trim()
    if (!text) {
      message.warning('请输入消息内容')
      return
    }
    const clientMsgId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const ts = Date.now()
    const row: ImMsg = { id: clientMsgId, from: 'me', text, ts, delivered: useRealtime ? false : true }
    setDraft('')
    emitMessageRow(row, { peerId: peer.id, clientMsgId, text, ts })
  }, [draft, emitMessageRow, message, peer, useRealtime])

  const insertEmoji = useCallback((emoji: string) => {
    const inner = textAreaRef.current?.resizableTextArea?.textArea
    if (!inner) {
      setDraft(d => d + emoji)
      setEmojiOpen(false)
      return
    }
    const start = inner.selectionStart ?? draft.length
    const end = inner.selectionEnd ?? draft.length
    setDraft(prev => prev.slice(0, start) + emoji + prev.slice(end))
    setEmojiOpen(false)
    queueMicrotask(() => {
      inner.focus()
      const p = start + emoji.length
      inner.setSelectionRange(p, p)
    })
  }, [draft])

  const beforeImageUpload: UploadProps['beforeUpload'] = file => {
    void uploadFileAndSend(file as File)
    return false
  }

  const beforeFileUpload: UploadProps['beforeUpload'] = file => {
    void uploadFileAndSend(file as File)
    return false
  }

  const onDropFiles = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragDepthRef.current = 0
      setDragOver(false)
      if (!useRealtime || !peer) {
        message.warning('请先登录后端并连接 IM')
        return
      }
      const files = [...e.dataTransfer.files]
      if (!files.length) return
      void (async () => {
        for (const f of files) {
          await uploadFileAndSend(f)
        }
      })()
    },
    [message, peer, uploadFileAndSend, useRealtime],
  )

  const onDragEnterShell = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current += 1
    setDragOver(true)
  }, [])

  const onDragLeaveShell = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current -= 1
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0
      setDragOver(false)
    }
  }, [])

  const onDragOverShell = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  if (!peer) return null

  const readFoot = (m: ImMsg): string | null => {
    if (!useRealtime || m.from !== 'me' || m.id !== lastMyMsgId) return null
    if (m.delivered === false) return '发送中…'
    if (peerReadUpTo >= m.ts) return '已读'
    return '未读'
  }

  const emojiPanel = (
    <div className="wt-contact-im__emoji-panel">
      {QUICK_EMOJIS.map(e => (
        <button key={e} type="button" className="wt-contact-im__emoji-cell" onClick={() => insertEmoji(e)}>
          {e}
        </button>
      ))}
    </div>
  )

  return (
    <Drawer
      rootClassName="wt-contact-im-drawer"
      title={
        <Space>
          <Typography.Text strong>与 {peer.name} 的对话</Typography.Text>
          {hasExternal ? (
            <Button
              type="link"
              size="small"
              icon={<ExportOutlined />}
              onClick={() => {
                if (openExternalImChatIfConfigured(peer)) message.success('已打开企业 IM')
                else message.warning('未配置企业 IM 地址')
              }}
            >
              企业 IM
            </Button>
          ) : null}
        </Space>
      }
      placement="right"
      width={420}
      onClose={onClose}
      open={open}
      destroyOnClose
    >
      <div className="wt-contact-im__drawer-stack">
        <div className="wt-contact-im__scroll">
        {msgs.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无消息，发送一条开始聊天" />
        ) : (
          renderRows.map(row => {
            if (row.kind === 'time') {
              return (
                <div key={row.key} className="wt-contact-im__time-sep">
                  {formatTimeSeparator(row.ts)}
                </div>
              )
            }
            const m = row.msg
            const foot = readFoot(m)
            const isMe = m.from === 'me'
            return (
              <div
                key={row.key}
                className={isMe ? 'wt-contact-im__bubble-row wt-contact-im__bubble-row--me' : 'wt-contact-im__bubble-row'}
              >
                <div className={isMe ? 'wt-contact-im__bubble wt-contact-im__bubble--me' : 'wt-contact-im__bubble wt-contact-im__bubble--peer'}>
                  <div className="wt-contact-im__bubble-meta">{isMe ? selfName || '我' : peer.name}</div>
                  <BubbleBody m={m} />
                </div>
                {foot ? (
                  <div className={`wt-contact-im__bubble-foot ${isMe ? 'wt-contact-im__bubble-foot--me' : ''}`}>
                    <span
                      className={
                        foot === '已读'
                          ? 'wt-contact-im__read-ok'
                          : foot === '未读'
                            ? 'wt-contact-im__read-no'
                            : 'wt-contact-im__read-pending'
                      }
                    >
                      {foot}
                    </span>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="wt-contact-im__composer">
        <div
          className={`wt-contact-im__input-shell${dragOver ? ' wt-contact-im__input-shell--drag' : ''}`}
          onDragEnter={onDragEnterShell}
          onDragLeave={onDragLeaveShell}
          onDragOver={onDragOverShell}
          onDrop={onDropFiles}
        >
          {dragOver ? <div className="wt-contact-im__input-drop-hint">松开以上传文件</div> : null}
          <Input.TextArea
            ref={textAreaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="输入消息…（Enter 发送，Shift+Enter 换行；可拖入图片或文件）"
            autoSize={{ minRows: 3, maxRows: 8 }}
            bordered={false}
            className="wt-contact-im__textarea"
            onPressEnter={e => {
              if (!e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <div className="wt-contact-im__input-toolbar">
            <Space size={4}>
              <Popover
                open={emojiOpen}
                onOpenChange={setEmojiOpen}
                content={emojiPanel}
                trigger="click"
                placement="topLeft"
                overlayInnerStyle={{ padding: 8 }}
              >
                <Button type="text" size="small" icon={<SmileOutlined />} disabled={!useRealtime} title="表情" />
              </Popover>
              <Upload accept="image/*" showUploadList={false} beforeUpload={beforeImageUpload} disabled={!useRealtime || uploading}>
                <Button type="text" size="small" icon={<FileImageOutlined />} loading={uploading} disabled={!useRealtime} title="图片" />
              </Upload>
              <Upload
                accept=".pdf,.zip,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                showUploadList={false}
                beforeUpload={beforeFileUpload}
                disabled={!useRealtime || uploading}
              >
                <Button type="text" size="small" icon={<PaperClipOutlined />} loading={uploading} disabled={!useRealtime} title="文件" />
              </Upload>
            </Space>
            <Button type="primary" size="small" icon={<SendOutlined />} onClick={send}>
              发送
            </Button>
          </div>
        </div>
      </div>
    </div>
    </Drawer>
  )
}
