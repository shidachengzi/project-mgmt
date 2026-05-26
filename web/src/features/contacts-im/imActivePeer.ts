/** 当前打开的 IM 对话对方 userId，用于未读：与抽屉内会话一致时不累加未读 */
let activeImPeerId: string | null = null

export function setActiveImPeerIdForUnread(id: string | null) {
  activeImPeerId = id
}

export function getActiveImPeerIdForUnread() {
  return activeImPeerId
}
