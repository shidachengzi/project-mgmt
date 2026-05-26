import { NextRequest } from 'next/server'
import { requireAuth, requireProjectPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { ensureProjectRbacSeeds } from '@/lib/projectRbacBootstrap'

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; userId: string }> },
) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const { projectId, userId } = await context.params
  await ensureProjectRbacSeeds(projectId)
  const allowed = await requireProjectPermission(auth, projectId, '项目权限::成员管理')
  if (allowed !== true) return allowed

  await prisma.projectMember.deleteMany({
    where: { projectId, userId },
  })
  return ok({ removed: true, userId })
}
