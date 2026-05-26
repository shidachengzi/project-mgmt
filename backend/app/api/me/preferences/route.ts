import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { getUserPreferences, patchUserPreferences, type MyTasksBoardLayoutV2 } from '@/modules/me/userPreferencesService'

const boardSchema = z.object({
  todo: z.array(z.string()),
  today: z.array(z.string()),
  next: z.array(z.string()),
  later: z.array(z.string()),
})

const patchSchema = z
  .object({
    myTasksBoardV2: boardSchema.optional(),
    accountAvatarDataUrl: z.union([z.string().max(2_000_000), z.null()]).optional(),
  })
  .strict()

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  try {
    const data = await getUserPreferences(auth.userId)
    return ok(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '读取用户偏好失败'
    console.error('[GET /api/me/preferences]', e)
    return fail(500, msg)
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail(400, '请求体须为 JSON')
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数无效', { issues: parsed.error.flatten() })

  const patch: { myTasksBoardV2?: MyTasksBoardLayoutV2; accountAvatarDataUrl?: string | null } = {}
  if (parsed.data.myTasksBoardV2) {
    patch.myTasksBoardV2 = parsed.data.myTasksBoardV2
  }
  if (parsed.data.accountAvatarDataUrl !== undefined) {
    patch.accountAvatarDataUrl = parsed.data.accountAvatarDataUrl
  }

  if (Object.keys(patch).length === 0) return fail(400, '无可更新的字段')

  try {
    const data = await patchUserPreferences(auth.userId, patch)
    return ok(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '保存用户偏好失败'
    console.error('[PATCH /api/me/preferences]', e)
    return fail(500, msg)
  }
}
