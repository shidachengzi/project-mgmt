import { NextRequest } from 'next/server'
import { requireAuth, requireProjectPermission } from '@/lib/guards'
import { fail, ok } from '@/lib/http'
import { buildProjectPermissionKey } from '@/lib/permissionMap'
import { hasProjectPermission } from '@/lib/rbac'
import { getProjectDetailForViewer, isUserProjectMember } from '@/modules/projects/projectCatalog'
import { invitePersonalDeskParticipantsFromWorkspace } from '@/modules/me/personalDeskProject'
import { diffWorkspaceChangedKeys, getProjectWorkspace, patchProjectWorkspace, type ProjectWorkspaceDTO } from '@/modules/projects/projectWorkspaceService'
import { notifyWorkspaceTaskParticipantsDelta } from '@/modules/notifications/userNotificationService'

const PERM_BASIC = buildProjectPermissionKey('项目权限', '基本设置')
const PERM_ATTACH = buildProjectPermissionKey('项目权限', '管理项目附件')
const PERM_PROJECT_STATUS = buildProjectPermissionKey('项目权限', '修改项目状态')
const PERM_TASK_EDIT = buildProjectPermissionKey('任务管理', '编辑任务')
const PERM_TASK_STATUS = buildProjectPermissionKey('任务管理', '修改任务状态')
const PERM_TASK_CREATE = buildProjectPermissionKey('任务管理', '新建任务')
const PERM_TASK_ATTACH = buildProjectPermissionKey('任务管理', '管理附件')
const PERM_TARGET_EDIT = buildProjectPermissionKey('目标管理', '编辑目标')
const PERM_TARGET_STATUS = buildProjectPermissionKey('目标管理', '修改目标状态')
const PERM_TARGET_CREATE = buildProjectPermissionKey('目标管理', '新建目标')
const PERM_TARGET_LINK = buildProjectPermissionKey('目标管理', '任务关联')
const PERM_TARGET_ATTACH = buildProjectPermissionKey('目标管理', '管理附件')

const FEED_TOP_LEVEL_KEYS = new Set<keyof ProjectWorkspaceDTO>(['activityByKey', 'commentsByKey', 'overviewActivities', 'taskParticipantsByKey', 'taskAttachmentsByKey'])

/** 目标关联任务 / 目标附件（可附带活动流字段，与前端 confirmRelatedPicker 一致） */
const TARGET_WORKSPACE_KEYS = new Set<keyof ProjectWorkspaceDTO>(['targetRelatedTasksByKey', 'targetAttachmentsByKey'])

/** 仅目标/任务动态与评论：任意项目成员可写；与 overview 活动、参与人、附件等区分 */
const FEED_ACTIVITY_COMMENT_KEYS = new Set<keyof ProjectWorkspaceDTO>(['activityByKey', 'commentsByKey'])

const canPersistFeedOnlyPatch = async (projectId: string, userId: string) => {
  const keys = [PERM_BASIC, PERM_PROJECT_STATUS, PERM_TASK_EDIT, PERM_TASK_STATUS, PERM_TASK_CREATE, PERM_TASK_ATTACH, PERM_TARGET_EDIT, PERM_TARGET_STATUS, PERM_TARGET_CREATE] as const
  for (const k of keys) {
    if (await hasProjectPermission(projectId, userId, k)) return true
  }
  return false
}

export async function GET(_req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = requireAuth(_req)
  if (auth instanceof Response) return auth
  const { projectId } = await context.params
  const gate = await getProjectDetailForViewer(projectId, auth.userId)
  if ('error' in gate) {
    if (gate.error === 'NOT_FOUND') return fail(404, '项目不存在')
    if (gate.error === 'FORBIDDEN') return fail(403, '无权查看该项目')
  }
  const ws = await getProjectWorkspace(projectId)
  if ('error' in ws) return fail(404, '项目不存在')
  return ok(ws.workspace)
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth
  const { projectId } = await context.params

  const gate = await getProjectDetailForViewer(projectId, auth.userId)
  if ('error' in gate) {
    if (gate.error === 'NOT_FOUND') return fail(404, '项目不存在')
    if (gate.error === 'FORBIDDEN') return fail(403, '无权操作该项目')
  }

  const body = (await req.json().catch(() => null)) as Partial<ProjectWorkspaceDTO> | null
  if (!body || typeof body !== 'object') return fail(400, '参数错误')

  const keys = Object.keys(body).filter(k => (body as Record<string, unknown>)[k] !== undefined)
  if (keys.length === 0) return fail(400, '无更新字段')

  const wsBefore = await getProjectWorkspace(projectId)
  if ('error' in wsBefore) return fail(404, '项目不存在')
  const changedTop = diffWorkspaceChangedKeys(wsBefore.workspace, body)
  if (changedTop.length === 0) {
    return ok(wsBefore.workspace)
  }

  const onlyAttachmentsInBody = keys.length === 1 && keys[0] === 'attachments'
  const onlyAttachmentsEffective = changedTop.length === 1 && changedTop[0] === 'attachments'
  const onlyActivityCommentsEffective =
    changedTop.length > 0 && changedTop.every((k) => FEED_ACTIVITY_COMMENT_KEYS.has(k))
  const onlyFeedEffective = changedTop.length > 0 && changedTop.every(k => FEED_TOP_LEVEL_KEYS.has(k))
  const onlyTargetWorkspaceEffective =
    changedTop.length > 0 &&
    changedTop.every(k => TARGET_WORKSPACE_KEYS.has(k) || FEED_ACTIVITY_COMMENT_KEYS.has(k))

  if (onlyAttachmentsInBody || onlyAttachmentsEffective) {
    const okAttachOrBasic = (await hasProjectPermission(projectId, auth.userId, PERM_ATTACH)) || (await hasProjectPermission(projectId, auth.userId, PERM_BASIC))
    if (!okAttachOrBasic) return fail(403, '无权限管理项目附件')
  } else if (onlyActivityCommentsEffective) {
    const okMember = await isUserProjectMember(projectId, auth.userId)
    if (!okMember) return fail(403, '无权限更新活动/评论记录（需加入该项目）')
  } else if (onlyTargetWorkspaceEffective) {
    if (changedTop.includes('targetRelatedTasksByKey')) {
      const okLink = await hasProjectPermission(projectId, auth.userId, PERM_TARGET_LINK)
      if (!okLink) return fail(403, '无权限关联目标任务')
    }
    if (changedTop.includes('targetAttachmentsByKey')) {
      const okTargetAttach = await hasProjectPermission(projectId, auth.userId, PERM_TARGET_ATTACH)
      if (!okTargetAttach) return fail(403, '无权限管理目标附件')
    }
    const hasFeedKeys = changedTop.some(k => FEED_ACTIVITY_COMMENT_KEYS.has(k))
    if (hasFeedKeys) {
      const okMember = await isUserProjectMember(projectId, auth.userId)
      if (!okMember) return fail(403, '无权限更新活动/评论记录（需加入该项目）')
    }
  } else if (onlyFeedEffective) {
    const okFeed = await canPersistFeedOnlyPatch(projectId, auth.userId)
    if (!okFeed) return fail(403, '无权限更新活动/评论记录（需要任务或目标相关编辑权限，或项目基本设置）')
  } else {
    const okBasic = await requireProjectPermission(auth, projectId, PERM_BASIC)
    if (okBasic !== true) return okBasic
  }

  const result = await patchProjectWorkspace(projectId, body)
  if ('error' in result) return fail(404, '项目不存在')

  if (changedTop.includes('taskParticipantsByKey')) {
    const beforeTp = wsBefore.workspace.taskParticipantsByKey ?? {}
    const afterTp = result.workspace.taskParticipantsByKey ?? {}
    void notifyWorkspaceTaskParticipantsDelta({
      projectId,
      before: { ...beforeTp },
      after: { ...afterTp },
      actorUserId: auth.userId
    }).catch(e => console.error('[notifyWorkspaceTaskParticipantsDelta]', e))
  }

  if (changedTop.includes('taskParticipantsByKey') && projectId.startsWith('pd-')) {
    await invitePersonalDeskParticipantsFromWorkspace(projectId)
  }

  return ok(result.workspace)
}
