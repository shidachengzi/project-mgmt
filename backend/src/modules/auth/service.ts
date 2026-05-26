import { prisma } from '@/lib/prisma'
import { issueSessionTokens, revokeSessionByRefreshToken, validatePassword, verifyRefreshToken } from '@/lib/auth'

export const loginByAccount = async (account: string, password: string) => {
  const a = String(account ?? '').trim()
  if (!a) return null

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: a }, { mobile: a }, { username: a }]
    }
  })
  if (!user) return null

  const matched = await validatePassword(password, user.passwordHash)
  if (!matched || user.status !== 'active') return null

  const tokens = await issueSessionTokens(user.id)
  return {
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      mobile: user.mobile,
    },
    tokens
  }
}

export const refreshSessionTokens = async (refreshToken: string) => {
  const payload = verifyRefreshToken(refreshToken)
  const session = await prisma.session.findUnique({ where: { refreshToken } })
  if (!session || session.expiresAt.getTime() < Date.now()) {
    await revokeSessionByRefreshToken(refreshToken)
    return null
  }

  await revokeSessionByRefreshToken(refreshToken)
  return issueSessionTokens(payload.sub)
}

export const logoutByRefreshToken = async (refreshToken?: string) => {
  if (!refreshToken) return
  await revokeSessionByRefreshToken(refreshToken)
}

export const getCurrentUserProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    mobile: user.mobile,
    status: user.status
  }
}
