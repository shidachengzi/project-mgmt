import { useCallback, useMemo } from 'react'
import { message } from 'antd'
import { getCurrentUserProjectRoleKey } from '../../../entities/permission/projectPermissions'

export type ProjectVisibilitySetting = '公开（企业所有成员）' | '私有（仅加入的项目成员）'

export type UseProjectDetailReadonlyParams = {
  projectId: string
  isProjectArchived: boolean
  projectVisibility: ProjectVisibilitySetting
}

export function useProjectDetailReadonly({
  projectId,
  isProjectArchived,
  projectVisibility,
}: UseProjectDetailReadonlyParams) {
  const currentProjectRoleKey = getCurrentUserProjectRoleKey(projectId)
  const isProjectReadonlyByRole = currentProjectRoleKey === 'observer'
  /** 公开项目：非项目成员仅可查看（与系统「管理公开项目」权限无关） */
  const isPublicProjectReadonlyBySystem =
    projectVisibility === '公开（企业所有成员）' && !currentProjectRoleKey
  const projectReadonly = isProjectArchived || isProjectReadonlyByRole || isPublicProjectReadonlyBySystem
  const projectReadonlyByPermission = isProjectReadonlyByRole || isPublicProjectReadonlyBySystem

  const readonlyBlockStyle = useMemo(
    () => (projectReadonly ? ({ opacity: 0.9 as const } as const) : undefined),
    [projectReadonly],
  )

  const ensureProjectEditable = useCallback(() => {
    if (isPublicProjectReadonlyBySystem) {
      message.warning('公开项目仅成员可编辑，您不在该项目成员中')
      return false
    }
    if (isProjectReadonlyByRole) {
      message.warning('当前角色为只读成员，暂无编辑权限')
      return false
    }
    if (!isProjectArchived) return true
    message.warning('项目已归档，暂不可编辑')
    return false
  }, [isPublicProjectReadonlyBySystem, isProjectReadonlyByRole, isProjectArchived])

  /** 目标/任务详情侧栏评论：任意项目成员（含只读角色）均可发布 */
  const ensureProjectMemberCommentAllowed = useCallback(() => {
    if (isPublicProjectReadonlyBySystem) {
      message.warning('公开项目仅成员可评论，您不在该项目成员中')
      return false
    }
    if (!isProjectArchived) return true
    message.warning('项目已归档，暂不可评论')
    return false
  }, [isPublicProjectReadonlyBySystem, isProjectArchived])

  /** 目标/任务侧栏评论输入：仅归档或非成员查看公开项目时禁用（只读成员可评） */
  const blockTargetFeedCommentInput = isProjectArchived || isPublicProjectReadonlyBySystem

  return {
    currentProjectRoleKey,
    isProjectReadonlyByRole,
    isPublicProjectReadonlyBySystem,
    projectReadonly,
    projectReadonlyByPermission,
    readonlyBlockStyle,
    ensureProjectEditable,
    ensureProjectMemberCommentAllowed,
    blockTargetFeedCommentInput,
  }
}
