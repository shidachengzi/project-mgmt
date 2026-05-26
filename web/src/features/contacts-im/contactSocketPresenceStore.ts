import { create } from 'zustand'

/** 以 IM Socket 连接为准的在线用户（userId → true） */
type State = {
  socketOnline: Record<string, true>
  setPresenceSnapshot: (userIds: string[]) => void
  setSocketPresence: (userId: string, online: boolean) => void
  clearSocketPresence: () => void
}

export const useContactSocketPresenceStore = create<State>(set => ({
  socketOnline: {},
  setPresenceSnapshot: userIds =>
    set({
      socketOnline: Object.fromEntries(
        userIds.filter(Boolean).map(id => [id, true as const]),
      ),
    }),
  setSocketPresence: (userId, online) =>
    set(s => {
      const next = { ...s.socketOnline }
      if (online) next[userId] = true
      else delete next[userId]
      return { socketOnline: next }
    }),
  clearSocketPresence: () => set({ socketOnline: {} }),
}))
