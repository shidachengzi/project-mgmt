import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/guards'
import { ok } from '@/lib/http'
import { searchUsers } from '@/modules/projects/projectCatalog'

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const q = req.nextUrl.searchParams.get('q') ?? undefined
  const users = await searchUsers(q, 80)
  return ok(users)
}
