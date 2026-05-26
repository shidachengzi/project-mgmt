import { prisma } from '@/lib/prisma'

export type ContactPresenceDTO = {
  /** 当前仍存在未过期会话的用户 id（可粗略视为「在线」） */
  onlineUserIds: string[]
}

/**
 * 有至少一条未过期 Session 的用户视为在线（非 WebSocket 级实时，仅作通讯录参考）。
 */
export async function listOnlineUserIdsBySession(): Promise<ContactPresenceDTO> {
  const now = new Date()
  const rows = await prisma.session.findMany({
    where: { expiresAt: { gt: now } },
    select: { userId: true },
    distinct: ['userId'],
  })
  return { onlineUserIds: rows.map((r) => r.userId) }
}
