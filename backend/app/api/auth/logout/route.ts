import { NextRequest, NextResponse } from 'next/server'
import { clearAuthCookies, REFRESH_COOKIE_KEY } from '@/lib/cookies'
import { logoutByRefreshToken } from '@/modules/auth/service'

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE_KEY)?.value
  await logoutByRefreshToken(refreshToken)
  const res = NextResponse.json({ ok: true, data: { loggedOut: true } })
  clearAuthCookies(res)
  return res
}

