export type ImMsg = {
  id: string
  from: 'me' | 'peer'
  text: string
  ts: number
  /** 仅我方发出：服务端/对端是否已确认送达（用于「发送中」） */
  delivered?: boolean
  attachmentUrl?: string
  attachmentName?: string
  attachmentSize?: number
  mimeType?: string
}

/** 每条会话单独一个 key，仅本机 localStorage */
export const MAX_LOCAL_IM_MSGS = 500

export function imThreadStorageKey(peerId: string) {
  return `pm-im-thread-${peerId}`
}

function parseMsgs(raw: string | null): ImMsg[] {
  if (!raw) return []
  try {
    const j = JSON.parse(raw) as unknown
    if (!Array.isArray(j)) return []
    return j.filter((x): x is ImMsg => {
      if (!x || typeof x !== 'object') return false
      const o = x as ImMsg
      if (typeof o.id !== 'string' || (o.from !== 'me' && o.from !== 'peer') || typeof o.ts !== 'number') return false
      if (typeof o.text !== 'string') return false
      const hasAtt = typeof o.attachmentUrl === 'string' && o.attachmentUrl.length > 0
      if (!hasAtt && !o.text.trim()) return false
      if (o.delivered !== undefined && typeof o.delivered !== 'boolean') return false
      if (o.attachmentUrl !== undefined && typeof o.attachmentUrl !== 'string') return false
      if (o.attachmentName !== undefined && typeof o.attachmentName !== 'string') return false
      if (o.attachmentSize !== undefined && typeof o.attachmentSize !== 'number') return false
      if (o.mimeType !== undefined && typeof o.mimeType !== 'string') return false
      return true
    })
  } catch {
    return []
  }
}

export function loadImThread(peerId: string): ImMsg[] {
  const key = imThreadStorageKey(peerId)
  try {
    let raw = localStorage.getItem(key)
    if (!raw) {
      const legacy = sessionStorage.getItem(key)
      if (legacy) {
        localStorage.setItem(key, legacy)
        sessionStorage.removeItem(key)
        raw = legacy
      }
    }
    return parseMsgs(raw)
  } catch {
    return []
  }
}

export function removeImThread(peerId: string): void {
  const key = imThreadStorageKey(peerId)
  try {
    localStorage.removeItem(key)
    try {
      sessionStorage.removeItem(key)
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pm-im-thread-updated', { detail: { peerId } }))
    }
  } catch {
    // ignore
  }
}

/** 删除本机所有 IM 会话缓存（localStorage 中以 pm-im-thread- 开头的项） */
export function clearAllLocalImThreads(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('pm-im-thread-')) localStorage.removeItem(key)
    }
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pm-im-thread-updated', { detail: {} }))
  }
}

export function saveImThread(peerId: string, list: ImMsg[]): ImMsg[] {
  const key = imThreadStorageKey(peerId)
  const trimmed = list.length > MAX_LOCAL_IM_MSGS ? list.slice(-MAX_LOCAL_IM_MSGS) : list
  try {
    localStorage.setItem(key, JSON.stringify(trimmed))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pm-im-thread-updated', { detail: { peerId } }))
    }
    return trimmed
  } catch {
    try {
      const half = trimmed.slice(-Math.floor(MAX_LOCAL_IM_MSGS / 2))
      localStorage.setItem(key, JSON.stringify(half))
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pm-im-thread-updated', { detail: { peerId } }))
      }
      return half
    } catch {
      return trimmed
    }
  }
}
