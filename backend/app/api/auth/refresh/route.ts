import { NextRequest, NextResponse } from 'next/server'
import { REFRESH_COOKIE_KEY, setAuthCookies } from '@/lib/cookies'
import { fail } from '@/lib/http'
import { refreshSessionTokens } from '@/modules/auth/service'

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE_KEY)?.value
  if (!refreshToken) return fail(401, '缺少刷新令牌')

  try {
    const tokens = await refreshSessionTokens(refreshToken)
    if (!tokens) return fail(401, '刷新令牌失效')
    const res = NextResponse.json({ ok: true, data: { refreshed: true } })
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken)
    return res
  } catch {
    return fail(401, '刷新令牌无效')
  }
}

