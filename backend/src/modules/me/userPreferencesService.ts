import { prisma } from '@/lib/prisma'

/** 与前端「我的任务」看板 pm-my-tasks-board-v2 结构一致 */
export type MyTasksBoardLayoutV2 = {
  todo: string[]
  today: string[]
  next: string[]
  later: string[]
}

export type UserPreferencesPayload = {
  myTasksBoardV2?: MyTasksBoardLayoutV2
  /** 账号设置头像（data URL），与前端 useAccountStore.profile.avatarDataUrl 对应 */
  accountAvatarDataUrl?: string | null
}

function asPrefs(raw: unknown): UserPreferencesPayload {
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as UserPreferencesPayload
    } catch {
      return {}
    }
    return {}
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as UserPreferencesPayload
}

/**
 * 使用 Raw SQL 读写 `users.preferences`，避免本地未执行 `prisma generate` 时
 * 生成客户端不含 `preferences` 字段导致 `user.update` 抛错（前端看到 500）。
 */
export async function getUserPreferences(userId: string): Promise<UserPreferencesPayload> {
  const rows = await prisma.$queryRaw<Array<{ preferences: unknown }>>`
    SELECT preferences FROM users WHERE id = ${userId} LIMIT 1
  `
  if (!rows.length) return {}
  return asPrefs(rows[0].preferences ?? null)
}

export async function patchUserPreferences(userId: string, patch: UserPreferencesPayload): Promise<UserPreferencesPayload> {
  const prev = await getUserPreferences(userId)
  const next: UserPreferencesPayload = { ...prev, ...patch }
  if (patch.accountAvatarDataUrl === null) {
    delete next.accountAvatarDataUrl
  }
  const jsonStr = JSON.stringify(next)

  await prisma.$executeRawUnsafe(
    'UPDATE `users` SET `preferences` = ?, `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `id` = ?',
    jsonStr,
    userId,
  )

  return next
}
