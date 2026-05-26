import { create } from 'zustand'

const STORAGE_KEY = 'pm-im-unread-by-peer'

function readFromStorage(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) out[k] = Math.min(99, Math.floor(n))
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
  counts: Record<string, number>
  hydrate: () => void
  increment: (peerId: string) => void
  clear: (peerId: string) => void
  clearAll: () => void
}

export const useContactImUnreadStore = create<State>((set, get) => ({
  counts: {},
  hydrate: () => set({ counts: readFromStorage() }),
  increment: peerId => {
    const c = { ...get().counts }
    c[peerId] = Math.min(99, (c[peerId] ?? 0) + 1)
    writeToStorage(c)
    set({ counts: c })
  },
  clear: peerId => {
    const c = { ...get().counts }
    delete c[peerId]
    writeToStorage(c)
    set({ counts: c })
  },
  clearAll: () => {
    writeToStorage({})
    set({ counts: {} })
  },
}))
