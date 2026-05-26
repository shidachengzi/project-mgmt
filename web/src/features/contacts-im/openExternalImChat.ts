import type { OrgMember } from '../../entities/org/model/types'

/**
 * 若配置了 `VITE_IM_CHAT_URL_TEMPLATE`，则在浏览器新标签打开企业 IM 等外链。
 * 占位符：`{{userId}}`、`{{name}}`（name 已 encodeURIComponent）、`{{email}}`、`{{username}}`
 */
export function buildExternalImChatUrl(user: Pick<OrgMember, 'id' | 'name' | 'email' | 'username'>): string | null {
  const tpl = import.meta.env.VITE_IM_CHAT_URL_TEMPLATE?.trim()
  if (!tpl) return null
  const name = encodeURIComponent(user.name ?? '')
  const email = encodeURIComponent((user.email ?? '').trim())
  const username = encodeURIComponent((user.username ?? '').trim())
  return tpl
    .replace(/\{\{userId\}\}/g, user.id)
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{email\}\}/g, email)
    .replace(/\{\{username\}\}/g, username)
}

export function openExternalImChatIfConfigured(user: Pick<OrgMember, 'id' | 'name' | 'email' | 'username'>): boolean {
  const url = buildExternalImChatUrl(user)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
