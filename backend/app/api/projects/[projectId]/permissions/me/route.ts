import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/guards'
import { ok } from '@/lib/http'
import { ensureProjectRbacSeeds } from '@/lib/projectRbacBootstrap'
import { getUserProjectPermissionKeys, getUserProjectRoleKeys } from '@/lib/rbac'

export async function GET(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const { projectId } = await context.params
  await ensureProjectRbacSeeds(projectId)

  const [roleKeys, permissionKeys] = await Promise.all([
    getUserProjectRoleKeys(projectId, auth.userId),
    getUserProjectPermissionKeys(projectId, auth.userId),
  ])

  return ok({
    projectId,
    userId: auth.userId,
    roleKeys,
    permissionKeys,
  })
}

