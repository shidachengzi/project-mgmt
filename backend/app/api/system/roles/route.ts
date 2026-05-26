import { NextRequest } from 'next/server'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { ok } from '@/lib/http'
import { listSystemRolesWithPermissions } from '@/modules/system-rbac/service'

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const allowed = await requireSystemPermission(auth, 'role.manage')
  if (allowed !== true) return allowed

  return ok(await listSystemRolesWithPermissions())
}

