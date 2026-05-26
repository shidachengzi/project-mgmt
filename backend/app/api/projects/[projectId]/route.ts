import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { buildProjectPermissionKey } from '@/lib/permissionMap'
import { hasProjectPermission, hasSystemPermission } from '@/lib/rbac'
import { deleteProjectById, getProjectDetailForViewer, updateProjectFields } from '@/modules/projects/projectCatalog'

const PERM_BASIC = buildProjectPermissionKey('项目权限', '基本设置')
const PERM_ARCHIVE = buildProjectPermissionKey('项目权限', '归档项目')
const PERM_DELETE = buildProjectPermissionKey('项目权限', '删除项目')

const patchSchema = z
  .object({
    title: z.string().min(1).max(191).optional(),
    visibility: z.enum(['public', 'private']).optional(),
    ownerUserId: z.union([z.string().min(1), z.null()]).optional(),
    coverKind: z.enum(['gradient', 'image']).optional(),
    coverImageData: z.union([z.string().max(12_000_000), z.null()]).optional(),
    archived: z.boolean().optional(),
  })
  .strict()

export async function GET(_req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = requireAuth(_req)
  if (auth instanceof Response) return auth
  const { projectId } = await context.params
  const result = await getProjectDetailForViewer(projectId, auth.userId)
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '项目不存在')
    if (result.error === 'FORBIDDEN') return fail(403, '无权查看该项目')
  }
  return ok(result.detail)
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const { projectId } = await context.params

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const d = parsed.data
  if (Object.keys(d).length === 0) return fail(400, '无更新字段')

  const keys = Object.keys(d) as (keyof typeof d)[]
  const onlyArchived = keys.length === 1 && keys[0] === 'archived'
  if (onlyArchived) {
    const allowedArchive = await hasProjectPermission(projectId, auth.userId, PERM_ARCHIVE)
    if (!allowedArchive) return fail(403, '无权限：需要「项目权限 - 归档项目」')
  } else {
    const allowedBasic = await hasProjectPermission(projectId, auth.userId, PERM_BASIC)
    if (!allowedBasic) return fail(403, '无权限：需要「项目权限 - 基本设置」')
    if (d.archived !== undefined) {
      const allowedArchive = await hasProjectPermission(projectId, auth.userId, PERM_ARCHIVE)
      if (!allowedArchive) return fail(403, '无权限：需要「项目权限 - 归档项目」')
    }
  }

  const before = await getProjectDetailForViewer(projectId, auth.userId)
  if ('error' in before) {
    if (before.error === 'NOT_FOUND') return fail(404, '项目不存在')
    if (before.error === 'FORBIDDEN') return fail(403, '无权操作该项目')
  }

  if (d.visibility === 'public' && before.detail.visibility !== 'public') {
    const canPublic = await hasSystemPermission(auth.userId, 'project.create_public')
    if (!canPublic) return fail(403, '无系统权限：不可将项目改为公开')
  }

  const result = await updateProjectFields(projectId, {
    title: d.title,
    visibility: d.visibility,
    ownerUserId: d.ownerUserId,
    coverKind: d.coverKind,
    coverImageData: d.coverImageData,
    archived: d.archived,
  })
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '项目不存在')
    if (result.error === 'EMPTY_TITLE') return fail(400, '标题不能为空')
    if (result.error === 'OWNER_NOT_FOUND') return fail(400, '负责人用户不存在')
  }

  const after = await getProjectDetailForViewer(projectId, auth.userId)
  if ('error' in after) return fail(500, '更新后读取项目失败')
  return ok(after.detail)
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = requireAuth(_req)
  if (auth instanceof Response) return auth
  const { projectId } = await context.params

  const allowed = await hasProjectPermission(projectId, auth.userId, PERM_DELETE)
  if (!allowed) return fail(403, '无权限：需要「项目权限 - 删除项目」')

  const before = await getProjectDetailForViewer(projectId, auth.userId)
  if ('error' in before) {
    if (before.error === 'NOT_FOUND') return fail(404, '项目不存在')
    if (before.error === 'FORBIDDEN') return fail(403, '无权操作该项目')
  }

  const result = await deleteProjectById(projectId)
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '项目不存在')
  }
  return ok({ deleted: true })
}
