import type { MutableRefObject } from 'react'

/** 本地保存后短时间内不把轮询变更当作「其他成员」更新 */
export const COLLABORATIVE_LOCAL_MUTATION_GRACE_MS = 15_000

/** 全应用共享：在 A 页保存后，B 页轮询也不误报 */
let globalLastLocalMutationAt = 0
/** 本地写入已发起但 revision/列表指纹尚未对齐前的保护窗 */
let suppressCollaborativeRemoteNotifyUntil = 0

export function markCollaborativeLocalMutation(localRef?: MutableRefObject<number>) {
  const now = Date.now()
  globalLastLocalMutationAt = now
  suppressCollaborativeRemoteNotifyUntil = now + COLLABORATIVE_LOCAL_MUTATION_GRACE_MS
  if (localRef) localRef.current = now
}

/** 本地拉取完成且已写入已知 revision / 指纹后调用 */
export function acknowledgeCollaborativeRemoteRevision() {
  suppressCollaborativeRemoteNotifyUntil = 0
}

export function shouldNotifyCollaborativeRemoteSync(): boolean {
  const now = Date.now()
  if (now < suppressCollaborativeRemoteNotifyUntil) return false
  return now - globalLastLocalMutationAt > COLLABORATIVE_LOCAL_MUTATION_GRACE_MS
}
