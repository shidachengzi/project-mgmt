import { create } from 'zustand'

const STORAGE_KEY = 'pm-im-peer-read-up-to'

function readFromStorage(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) out[k] = n
    }
    return out
  } catch {
    return {}
  }
}

function writeToStorage(m: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m))
  } catch {
    // ignore
  }
}

type State = {
  /** peerId → 对方已读至该时间戳（含）：用于「我发出的」最后一条是否显示已读 */
  peerReadUpToTs: Record<string, number>
  hydrate: () => void
  applyReadFromPeer: (peerId: string, upToTs: number) => void
}

export const useContactImReadReceiptStore = create<State>((set, get) => ({
  peerReadUpToTs: {},
  hydrate: () => set({ peerReadUpToTs: readFromStorage() }),
  applyReadFromPeer: (peerId, upToTs) => {
    const cur = get().peerReadUpToTs[peerId] ?? 0
    const nextVal = Math.max(cur, upToTs)
    if (nextVal <= cur) return
    const next = { ...get().peerReadUpToTs, [peerId]: nextVal }
    writeToStorage(next)
    set({ peerReadUpToTs: next })
  },
}))
