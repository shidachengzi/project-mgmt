import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { hasProjectPermission } from '@/lib/rbac'
import { invitePersonalDeskTaskOwnersFromDb, isPersonalDeskProjectId } from '@/modules/me/personalDeskProject'
import { assertCanViewProject, createProjectTask, listProjectTasksTree, parseDateInput, PERM_TARGET_CREATE, PERM_TASK_CREATE } from '@/modules/projects/projectTaskService'
import { notifyTargetParticipantNamesDelta, notifyTaskOrTargetOwnerAssigned } from '@/modules/notifications/userNotificationService'

const postSchema = z.object({
  title: z.string().min(1),
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

export async function GET(_req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = requireAuth(_req)
  if (auth instanceof Response) return auth
  const { projectId } = await context.params
  const gate = await assertCanViewProject(projectId, auth.userId)
  if ('error' in gate) {
    if (gate.error === 'NOT_FOUND') return fail(404, '项目不存在')
    return fail(403, '无权查看该项目')
  }
  const tree = await listProjectTasksTree(projectId)
  return ok(tree)
}

export async function POST(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const { projectId } = await context.params
  const gate = await assertCanViewProject(projectId, auth.userId)
  if ('error' in gate) {
    if (gate.error === 'NOT_FOUND') return fail(404, '项目不存在')
    return fail(403, '无权操作该项目')
  }
  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return fail(400, '参数错误')

  const d = parsed.data
  const isTarget = d.kind === 'target'
  const createPerm = isTarget ? PERM_TARGET_CREATE : PERM_TASK_CREATE
  const can = await hasProjectPermission(projectId, auth.userId, createPerm)
  if (!can) return fail(403, isTarget ? '无权限新建目标' : '无权限新建任务')
  const startDate = parseDateInput(d.startDate)
  const endDate = parseDateInput(d.endDate)
  if (d.startDate !== undefined && startDate === null && d.startDate !== null && d.startDate !== '') return fail(400, '开始日期格式无效')
  if (d.endDate !== undefined && endDate === null && d.endDate !== null && d.endDate !== '') return fail(400, '结束日期格式无效')

  const result = await createProjectTask(projectId, {
    title: d.title,
    kind: d.kind,
    parentId: d.parentId,
    status: d.status,
    priority: d.priority,
    startDate: startDate === undefined ? undefined : startDate,
    endDate: endDate === undefined ? undefined : endDate,
    ownerUserId: d.ownerUserId,
    createdByUserId: auth.userId,
    stageTitle: d.stageTitle ?? undefined,
    description: d.description ?? undefined,
    progress: d.progress,
    attachments: d.attachments,
    sortOrder: d.sortOrder
  })
  if ('error' in result) {
    if (result.error === 'EMPTY_TITLE') return fail(400, '标题不能为空')
    if (result.error === 'PARENT_NOT_FOUND') return fail(404, '上级任务不存在')
    if (result.error === 'OWNER_NOT_FOUND') return fail(400, '负责人不存在')
    if (result.error === 'CREATOR_NOT_FOUND') return fail(400, '创建人不存在')
    return fail(400, '创建失败')
  }
  if (isPersonalDeskProjectId(projectId)) {
    await invitePersonalDeskTaskOwnersFromDb(projectId)
  }
  const taskId = result.id
  const taskTitle = d.title.trim()
  const kind = d.kind ?? 'task'
  if (d.ownerUserId) {
    void notifyTaskOrTargetOwnerAssigned({
      projectId,
      taskId,
      taskTitle,
      kind,
      newOwnerUserId: d.ownerUserId,
      actorUserId: auth.userId
    }).catch(e => console.error('[notifyTaskOrTargetOwnerAssigned]', e))
  }
  if (isTarget && d.description) {
    void notifyTargetParticipantNamesDelta({
      projectId,
      taskId,
      taskTitle,
      previousDescription: null,
      nextDescription: d.description,
      actorUserId: auth.userId
    }).catch(e => console.error('[notifyTargetParticipantNamesDelta]', e))
  }
  return ok({ id: taskId })
}
