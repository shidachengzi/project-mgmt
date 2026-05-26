import { prisma } from '@/lib/prisma'

export type ImThreadRowDTO = {
  fromUserId: string
  toUserId: string
  clientMsgId: string
  text: string
  createdAt: string
  attachmentUrl?: string | null
  attachmentName?: string | null
  attachmentSize?: number | null
  mimeType?: string | null
}

/** 幂等写入（重复 clientMsgId 忽略） */
export async function createImDirectMessage(input: {
  fromUserId: string
  toUserId: string
  clientMsgId: string
  text: string
  attachmentUrl?: string | null
  attachmentName?: string | null
  attachmentSize?: number | null
  mimeType?: string | null
}): Promise<{ ok: true } | { ok: false; code: 'duplicate' | 'error' }> {
  const url = input.attachmentUrl?.trim() || null
  const hasFile = Boolean(url)
  const textTrim = typeof input.text === 'string' ? input.text.trim() : ''
  if (!hasFile && !textTrim) {
    return { ok: false, code: 'error' }
  }
  try {
    await prisma.imDirectMessage.create({
      data: {
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        clientMsgId: input.clientMsgId,
        text: textTrim,
        attachmentUrl: url,
        attachmentName: input.attachmentName?.trim() || null,
        attachmentSize: typeof input.attachmentSize === 'number' && Number.isFinite(input.attachmentSize) ? Math.floor(input.attachmentSize) : null,
        mimeType: input.mimeType?.trim()?.slice(0, 128) || null,
      },
    })
    return { ok: true }
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code?: string }).code) : ''
    if (code === 'P2002') return { ok: false, code: 'duplicate' }
    console.error('[createImDirectMessage]', e)
    return { ok: false, code: 'error' }
  }
}

const threadSelect = {
  fromUserId: true,
  toUserId: true,
  clientMsgId: true,
  text: true,
  createdAt: true,
  attachmentUrl: true,
  attachmentName: true,
  attachmentSize: true,
  mimeType: true,
} as const

function rowToDto(r: {
  fromUserId: string
  toUserId: string
  clientMsgId: string
  text: string
  createdAt: Date
  attachmentUrl: string | null
  attachmentName: string | null
  attachmentSize: number | null
  mimeType: string | null
}): ImThreadRowDTO {
  return {
    fromUserId: r.fromUserId,
    toUserId: r.toUserId,
    clientMsgId: r.clientMsgId,
    text: r.text,
    createdAt: r.createdAt.toISOString(),
    attachmentUrl: r.attachmentUrl,
    attachmentName: r.attachmentName,
    attachmentSize: r.attachmentSize,
    mimeType: r.mimeType,
  }
}

export async function listImThreadBetween(viewerId: string, peerId: string, take = 500): Promise<ImThreadRowDTO[]> {
  const rows = await prisma.imDirectMessage.findMany({
    where: {
      OR: [
        { fromUserId: viewerId, toUserId: peerId },
        { fromUserId: peerId, toUserId: viewerId },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take,
    select: threadSelect,
  })
  return rows.map(rowToDto)
}

/** 近期「发给我」的消息，用于离线补未读徽标（默认近 48 小时，最多 take 条） */
export async function listRecentInboundToUser(viewerId: string, take = 150): Promise<ImThreadRowDTO[]> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000)
  const rows = await prisma.imDirectMessage.findMany({
    where: {
      toUserId: viewerId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take,
    select: threadSelect,
  })
  return rows.reverse().map(rowToDto)
}

/** 删除早于「今天 − retentionDays」的 IM 记录（仅 im_direct_messages） */
export async function deleteImDirectMessagesOlderThanDays(retentionDays: number): Promise<number> {
  const days = Math.max(1, Math.min(3650, Math.floor(retentionDays)))
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const res = await prisma.imDirectMessage.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return res.count
}
