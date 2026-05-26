import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSystemPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { createProjectForUser, listProjectsVisibleToUser, overviewLiteFromWorkspace } from '@/modules/projects/projectCatalog'
import { patchProjectWorkspace } from '@/modules/projects/projectWorkspaceService'

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const rows = await listProjectsVisibleToUser(auth.userId)
  return ok(
    rows.map((p) => {
      const overview = overviewLiteFromWorkspace(p.workspace)
      return {
        id: p.id,
        title: p.title,
        visibility: p.visibility,
        ownerUserId: p.ownerUserId,
        archived: p.archived,
        progressStatus: overview.progressStatus,
        overviewOwner: overview.owner,
        overviewStartDate: overview.startDate,
        overviewEndDate: overview.endDate,
        overviewHealthStatus: overview.healthStatus,
        coverKind: p.coverKind === 'image' ? 'image' : 'gradient',
        coverImageData: p.coverKind === 'image' ? p.coverImageData ?? null : null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }
    }),
  )
}

const initialWorkspaceSchema = z
  .object({
    owner: z.string().max(191).optional(),
    startDate: z.string().max(32).optional(),
    endDate: z.string().max(32).optional(),
    description: z.string().max(8000).optional(),
    visibilityLabel: z.enum(['公开（企业所有成员）', '私有（仅加入的项目成员）']).optional(),
    createActivity: z
      .object({
        actor: z.string().max(191),
        before: z.string().max(191),
        after: z.string().max(2000),
      })
      .optional(),
  })
  .optional()

const postSchema = z.object({
  id: z.string().min(1).max(36).optional(),
  title: z.string().min(1).max(191),
  visibility: z.enum(['public', 'private']),
  initialWorkspace: initialWorkspaceSchema,
})

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')

  const vis = parsed.data.visibility
  const perm = vis === 'public' ? 'project.create_public' : 'project.create_private'
  const allowed = await requireSystemPermission(auth, perm)
  if (allowed !== true) return allowed

  const id = parsed.data.id ?? `${Date.now()}`
  const result = await createProjectForUser({
    id,
    title: parsed.data.title.trim(),
    visibility: vis,
    creatorId: auth.userId,
  })
  if ('error' in result) return fail(500, '创建项目失败')

  const iw = parsed.data.initialWorkspace
  if (iw) {
    const title = parsed.data.title.trim()
    const nowIso = new Date().toISOString()
    const defaultEnd = new Date()
    defaultEnd.setMonth(defaultEnd.getMonth() + 1)
    const startIso = iw.startDate?.trim() || nowIso.slice(0, 10)
    const endIso = iw.endDate?.trim() || defaultEnd.toISOString().slice(0, 10)
    const owner = iw.owner?.trim() || '—'
    const desc = iw.description?.trim() ? iw.description.trim() : '无'
    const overview: Record<string, unknown> = {
      title,
      owner,
      startDate: startIso,
      endDate: endIso,
      description: desc,
      progressStatus: '未开始',
      healthStatus: '正常',
      statusDescription: '无',
    }
    if (iw.visibilityLabel) overview.visibility = iw.visibilityLabel
    const overviewActivities =
      iw.createActivity != null
        ? [
            {
              id: `po-create-${result.id}-${Date.now()}`,
              actor: iw.createActivity.actor,
              targetTitle: title,
              fieldLabel: '创建项目',
              before: iw.createActivity.before,
              after: iw.createActivity.after,
              createdAt: nowIso,
            },
          ]
        : []
    await patchProjectWorkspace(result.id, { overview, overviewActivities })
  }

  return ok({ id: result.id })
}
