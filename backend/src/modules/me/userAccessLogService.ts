import { prisma } from '@/lib/prisma'

const MAX_PATH = 512
const MAX_UA = 7900

export function pickClientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first.slice(0, 64)
  }
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real.slice(0, 64)
  return null
}

export async function appendUserAccessLog(input: {
  userId: string
  path: string
  userAgent: string | null
  ip: string | null
}) {
  const path = input.path.slice(0, MAX_PATH)
  const ua = input.userAgent ? input.userAgent.slice(0, MAX_UA) : null
  await prisma.userAccessLog.create({
    data: {
      userId: input.userId,
      path,
      userAgent: ua,
      ip: input.ip,
    },
  })
}

export async function listUserAccessLogsPaged(userId: string, page: number, pageSize: number) {
  const take = Math.min(Math.max(pageSize, 1), 100)
  const p = Math.max(page, 1)
  const skip = (p - 1) * take

  const [items, total] = await Promise.all([
    prisma.userAccessLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        path: true,
        userAgent: true,
        ip: true,
        createdAt: true,
      },
    }),
    prisma.userAccessLog.count({ where: { userId } }),
  ])

  return { items, total, page: p, pageSize: take }
}
