import bcrypt from 'bcryptjs'
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken'
import { jwtExpiresInToMaxAgeSeconds } from './jwtExpiresInMaxAge'
import { prisma } from './prisma'

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev_access_secret'
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret'
const PASSWORD_RESET_SECRET = process.env.JWT_PASSWORD_RESET_SECRET || process.env.JWT_REFRESH_SECRET || 'dev_password_reset_secret'
const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '2h'
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'
const PASSWORD_RESET_EXPIRES_IN = process.env.JWT_PASSWORD_RESET_EXPIRES_IN || '15m'

type TokenPayload = {
  sub: string
  type: 'access' | 'refresh'
}

const signToken = (payload: TokenPayload, secret: string, expiresIn: string) => jwt.sign(payload, secret, { expiresIn } as SignOptions)

export const signAccessToken = (userId: string) => signToken({ sub: userId, type: 'access' }, ACCESS_SECRET, ACCESS_EXPIRES_IN)

export const signRefreshToken = (userId: string) => signToken({ sub: userId, type: 'refresh' }, REFRESH_SECRET, REFRESH_EXPIRES_IN)

export const verifyAccessToken = (token: string): TokenPayload => jwt.verify(token, ACCESS_SECRET) as TokenPayload

export const verifyRefreshToken = (token: string): TokenPayload => jwt.verify(token, REFRESH_SECRET) as TokenPayload

export const validatePassword = (plain: string, hash: string) => bcrypt.compare(plain, hash)

export const signPasswordResetToken = (userId: string) => jwt.sign({ sub: userId, type: 'password-reset' }, PASSWORD_RESET_SECRET, { expiresIn: PASSWORD_RESET_EXPIRES_IN } as SignOptions)

export const verifyPasswordResetToken = (token: string): string => {
  const p = jwt.verify(token, PASSWORD_RESET_SECRET) as JwtPayload & { type?: string }
  if (p.type !== 'password-reset' || typeof p.sub !== 'string') throw new Error('INVALID_RESET_TOKEN')
  return p.sub
}

export const issueSessionTokens = async (userId: string) => {
  const accessToken = signAccessToken(userId)
  const refreshToken = signRefreshToken(userId)
  const payload = verifyRefreshToken(refreshToken) as JwtPayload
  const expSec = payload.exp
  const refreshFallbackMs = jwtExpiresInToMaxAgeSeconds(REFRESH_EXPIRES_IN, 60 * 60 * 24 * 7) * 1000
  const expiresAt =
    typeof expSec === 'number' && Number.isFinite(expSec) ? new Date(expSec * 1000) : new Date(Date.now() + refreshFallbackMs)

  await prisma.session.create({
    data: {
      userId,
      refreshToken,
      expiresAt
    }
  })

  return { accessToken, refreshToken }
}

export const revokeSessionByRefreshToken = async (refreshToken: string) => {
  await prisma.session.deleteMany({ where: { refreshToken } })
}
