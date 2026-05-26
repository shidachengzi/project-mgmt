import { NextRequest } from 'next/server'
import { z } from 'zod'
import { setAuthCookies } from '@/lib/cookies'
import { fail } from '@/lib/http'
import { NextResponse } from 'next/server'
import { loginByAccount } from '@/modules/auth/service'
import { appendUserAccessLog, pickClientIp } from '@/modules/me/userAccessLogService'

const loginSchema = z.object({
  account: z.string().min(1),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) return fail(400, '参数错误')

    const { account, password } = parsed.data
    const result = await loginByAccount(account, password)
    if (!result) return fail(401, '账号或密码错误')

    try {
      await appendUserAccessLog({
        userId: result.user.id,
        path: '登录',
        userAgent: req.headers.get('user-agent'),
        ip: pickClientIp(req.headers),
      })
    } catch (logErr) {
      console.error('[auth/login] access log', logErr)
    }

    const res = NextResponse.json(
      {
        ok: true,
        data: {
          user: result.user,
        },
      },
      { status: 200 },
    )
    setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken)
    return res
  } catch (e) {
    console.error('[auth/login]', e)
    const msg = e instanceof Error ? e.message : '服务器错误'
    return fail(500, msg)
  }
}

