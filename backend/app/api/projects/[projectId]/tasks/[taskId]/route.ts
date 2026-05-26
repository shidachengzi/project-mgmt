import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { hasProjectPermission } from '@/lib/rbac'
import { invitePersonalDeskTaskOwnersFromDb, isPersonalDeskProjectId } from '@/modules/me/personalDeskProject'
import { assertCanViewProject, canPatchTarget, canPatchTask, deleteProjectTask, getProjectTaskKind, parseDateInput, PERM_TARGET_DELETE, PERM_TASK_DELETE, updateProjectTask } from '@/modules/projects/projectTaskService'
import { notifyTargetParticipantNamesDelta, notifyTaskOrTargetOwnerAssigned } from '@/modules/notifications/userNotificationService'

const patchSchema = z
  .object({
    title: z.string().min(1).optional(),
    kind: z.enum(['stage', 'task', 'subtask', 'target']).optional(),
    parentId: z.string().min(1).nullable().optional(),
    status: z.string().max(64).optional(),
    priority: z.string().max(32).optional(),
    startDate: z.union([z.string(), z.null()]).optional(),
    endDate: z.union([z.string(), z.null()]).optional(),
    ownerUserId: z.string().min(1).nullable().optional(),
    stageTitle: z.string().max(191).nullable().optional(),
    description: z.string().nullable().optional(),
    progress: z.number().int().min(0).max(100).optional(),
    attachments: z.number().int().min(0).optional(),
    sortOrder: z.number().int().optional()
  })
  .strict()

export async function PATCH(req: NextRequest, context: { params: Promise<{ projectId: string; taskId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const { projectId, taskId } = await context.params
  const gate = await assertCanViewProject(projectId, auth.userId)
  if ('error' in gate) {
    if (gate.error === 'NOT_FOUND') return fail(404, '项目不存在')
    return fail(403, '无权操作该项目')
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')
  const d = parsed.data
  if (Object.keys(d).length === 0) return fail(400, '无更新字段')

  const patchPayload: Record<string, unknown> = { ...d }
  const rowKind = await getProjectTaskKind(projectId, taskId)
  if (!rowKind) return fail(404, '任务不存在')
  const allowed = rowKind === 'target' ? await canPatchTarget(auth.userId, projectId, patchPayload) : await canPatchTask(auth.userId, projectId, patchPayload)
  if (!allowed) return fail(403, rowKind === 'target' ? '无权限编辑目标' : '无权限编辑任务')

  const startDate = d.startDate !== undefined ? parseDateInput(d.startDate) : undefined
  const endDate = d.endDate !== undefined ? parseDateInput(d.endDate) : undefined
  if (d.startDate !== undefined && startDate === null && d.startDate !== null && d.startDate !== '') return fail(400, '开始日期格式无效')
  if (d.endDate !== undefined && endDate === null && d.endDate !== null && d.endDate !== '') return fail(400, '结束日期格式无效')

  const beforeRow = await prisma.projectTask.findFirst({
    where: { id: taskId, projectId },
    select: { status: true, title: true, kind: true, ownerUserId: true, description: true }
  })

  const result = await updateProjectTask(projectId, taskId, {
    title: d.title,
    kind: d.kind,
    parentId: d.parentId,
    status: d.status,
    priority: d.priority,
    startDate: startDate === undefined ? undefined : startDate,
    endDate: endDate === undefined ? undefined : endDate,
    ownerUserId: d.ownerUserId,
    stageTitle: d.stageTitle,
    description: d.description,
    progress: d.progress,
    attachments: d.attachments,
    sortOrder: d.sortOrder
  })
  if ('error' in result) {
    if (result.error === 'NOT_FOUND') return fail(404, '任务不存在')
    if (result.error === 'EMPTY_TITLE') return fail(400, '标题不能为空')
    if (result.error === 'PARENT_NOT_FOUND') return fail(404, '上级任务不存在')
    if (result.error === 'INVALID_PARENT') return fail(400, '不能将任务设为自己的子任务')
    if (result.error === 'OWNER_NOT_FOUND') return fail(400, '负责人不存在')
  }
  if (isPersonalDeskProjectId(projectId) && d.ownerUserId !== undefined) {
    await invitePersonalDeskTaskOwnersFromDb(projectId)
  }

  if (beforeRow) {
    const taskTitle = (d.title !== undefined ? d.title : beforeRow.title).trim()
    if (d.ownerUserId !== undefined && (beforeRow.ownerUserId ?? null) !== (d.ownerUserId ?? null) && d.ownerUserId) {
      void notifyTaskOrTargetOwnerAssigned({
        projectId,
        taskId,
        taskTitle,
        kind: beforeRow.kind,
        newOwnerUserId: d.ownerUserId,
        actorUserId: auth.userId
      }).catch(e => console.error('[notifyTaskOrTargetOwnerAssigned]', e))
    }
    if (rowKind === 'target' && d.description !== undefined) {
      void notifyTargetParticipantNamesDelta({
        projectId,
        taskId,
        taskTitle,
        previousDescription: beforeRow.description,
        nextDescription: d.description,
        actorUserId: auth.userId
      }).catch(e => console.error('[notifyTargetParticipantNamesDelta]', e))
    }
  }

  return ok({ ok: true })
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ projectId: string; taskId: string }> }) {
  const auth = requireAuth(_req)
  if (auth instanceof Response) return auth
  const { projectId, taskId } = await context.params
  const gate = await assertCanViewProject(projectId, auth.userId)
  if ('error' in gate) {
    if (gate.error === 'NOT_FOUND') return fail(404, '项目不存在')
    return fail(403, '无权操作该项目')
  }
  const rowKind = await getProjectTaskKind(projectId, taskId)
  if (!rowKind) return fail(404, '任务不存在')
  const deletePerm = rowKind === 'target' ? PERM_TARGET_DELETE : PERM_TASK_DELETE
  const can = await hasProjectPermission(projectId, auth.userId, deletePerm)
  if (!can) return fail(403, rowKind === 'target' ? '无权限删除目标' : '无权限删除任务')
  const result = await deleteProjectTask(projectId, taskId)
  if ('error' in result && result.error === 'NOT_FOUND') return fail(404, '任务不存在')
  return ok({ ok: true })
}
