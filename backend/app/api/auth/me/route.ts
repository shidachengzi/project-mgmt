import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { getCurrentUserProfile } from '@/modules/auth/service'

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const user = await getCurrentUserProfile(auth.userId)
  if (!user) return fail(404, '用户不存在')
  return ok(user)
}

