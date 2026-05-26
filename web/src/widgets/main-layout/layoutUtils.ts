import dayjs from 'dayjs'
import { loadImThread } from '../../features/contacts-im/contactLocalImStorage'
import type { OrgMember } from '../../entities/org/model/types'

export const projectColors = ['#5b8ff9', '#61d6a7', '#f6bd16', '#7262fd']

export const avatarPalette = ['#f58aa8', '#7fd1ae', '#69b1ff', '#ffd666', '#b37feb', '#5c8df6', '#95de64']

export function projectColorForId(id: string) {
  let h = 0
  const s = String(id ?? '')
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return projectColors[Math.abs(h) % projectColors.length]
}

export function avatarColorForId(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  return avatarPalette[Math.abs(h) % avatarPalette.length]
}

export function imPreviewFromLastMsg(last: ReturnType<typeof loadImThread>[number] | undefined): string {
  if (!last) return ''
  const hasFile = Boolean(last.attachmentUrl?.trim())
  const t = last.text?.trim() ?? ''
  if (hasFile) return t ? `${t.length > 24 ? `${t.slice(0, 24)}…` : t} · [附件]` : '[附件]'
  return t.length > 72 ? `${t.slice(0, 72)}…` : t
}

export function buildImHeaderRows(
  counts: Record<string, number>,
  members: Pick<OrgMember, 'id' | 'name' | 'avatarText' | 'avatarColor'>[],
  authedUserId: string | null,
) {
  const memberMap = new Map(members.map(m => [m.id, m]))
  const peerIds = new Set<string>()
  for (const [k, v] of Object.entries(counts)) {
    if (v > 0 && k && k !== authedUserId) peerIds.add(k)
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('pm-im-thread-')) continue
      const pid = key.slice('pm-im-thread-'.length)
      if (pid && pid !== authedUserId) peerIds.add(pid)
    }
  } catch {
    // ignore
  }
  const rows = [...peerIds].map(peerId => {
    const thread = loadImThread(peerId)
    const last = thread.length ? thread[thread.length - 1] : undefined
    const member = memberMap.get(peerId)
    return {
      peerId,
      name: (member?.name ?? '').trim() || `用户 ${peerId.slice(0, 8)}`,
      avatarText: member?.avatarText,
      avatarColor: member?.avatarColor ?? avatarColorForId(peerId),
      unread: counts[peerId] ?? 0,
      preview: imPreviewFromLastMsg(last),
      lastTs: last?.ts ?? 0,
    }
  })
  rows.sort((a, b) => {
    if (a.unread !== b.unread) return b.unread - a.unread
    return b.lastTs - a.lastTs
  })
  return rows.slice(0, 10)
}

export function formatInboxTime(iso: string): string {
  const d = dayjs(iso)
  const today = dayjs()
  if (d.isSame(today, 'day')) return d.format('今天 HH:mm')
  if (d.isSame(today.subtract(1, 'day'), 'day')) return d.format('昨天 HH:mm')
  if (d.isSame(today, 'year')) return d.format('M月D日 HH:mm')
  return d.format('YYYY年M月D日 HH:mm')
}
