import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { listMyTasks } from '@/modules/me/myTasksService'

const scopeSchema = z.enum(['responsible', 'participated', 'created'])

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const { searchParams } = new URL(req.url)
  const scopeRaw = searchParams.get('scope') ?? 'responsible'
  const parsed = scopeSchema.safeParse(scopeRaw)
  if (!parsed.success) return fail(400, 'scope 须为 responsible | participated | created')

  const data = await listMyTasks(auth.userId, parsed.data)
  return ok(data)
}
