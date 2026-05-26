import type { NextResponse } from 'next/server'
import { jwtExpiresInToMaxAgeSeconds } from './jwtExpiresInMaxAge'

const isSecureCookie = () => process.env.COOKIE_SECURE === 'true'

const accessCookieMaxAgeSec = jwtExpiresInToMaxAgeSeconds(process.env.JWT_ACCESS_EXPIRES_IN, 60 * 60 * 2)
const refreshCookieMaxAgeSec = jwtExpiresInToMaxAgeSeconds(process.env.JWT_REFRESH_EXPIRES_IN, 60 * 60 * 24 * 7)

const cookieDomain = () => {
  const d = process.env.COOKIE_DOMAIN?.trim()
  return d ? d : undefined
}

export const ACCESS_COOKIE_KEY = 'pm_access_token'
export const REFRESH_COOKIE_KEY = 'pm_refresh_token'

export const setAuthCookies = (res: NextResponse, accessToken: string, refreshToken: string) => {
  const domain = cookieDomain()
  const secure = isSecureCookie()
  const base = {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    domain,
  }

  res.cookies.set(ACCESS_COOKIE_KEY, accessToken, {
    ...base,
    maxAge: accessCookieMaxAgeSec,
  })
  res.cookies.set(REFRESH_COOKIE_KEY, refreshToken, {
    ...base,
    maxAge: refreshCookieMaxAgeSec,
  })
}

export const clearAuthCookies = (res: NextResponse) => {
  const domain = cookieDomain()
  res.cookies.set(ACCESS_COOKIE_KEY, '', { httpOnly: true, sameSite: 'lax', path: '/', domain, maxAge: 0 })
  res.cookies.set(REFRESH_COOKIE_KEY, '', { httpOnly: true, sameSite: 'lax', path: '/', domain, maxAge: 0 })
}

