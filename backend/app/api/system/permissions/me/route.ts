import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/guards'
import { ok } from '@/lib/http'
import { getUserSystemPermissionKeys, getUserSystemRoles } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const [roles, permissions] = await Promise.all([getUserSystemRoles(auth.userId), getUserSystemPermissionKeys(auth.userId)])

  return ok({
    userId: auth.userId,
    roleKeys: roles.map((r) => r.key),
    permissionKeys: permissions,
  })
}

