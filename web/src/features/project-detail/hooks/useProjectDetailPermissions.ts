import { useCallback, useMemo } from 'react'
import { message } from 'antd'
import { buildMappedProjectPermissionKey } from '../../../entities/permission/projectPermissionMap'

export type UseProjectDetailPermissionsParams = {
  projectReadonly: boolean
  projectReadonlyByPermission: boolean
  backendFlatPerms: readonly string[]
  ensureProjectEditable: () => boolean
}

export function useProjectDetailPermissions({
  projectReadonly,
  projectReadonlyByPermission,
  backendFlatPerms,
  ensureProjectEditable,
}: UseProjectDetailPermissionsParams) {
  const currentRolePermissionSet = useMemo(() => new Set(backendFlatPerms), [backendFlatPerms])

  const hasMappedProjectPermission = useCallback(
    (sectionTitle: string, item: string) =>
      currentRolePermissionSet.has(buildMappedProjectPermissionKey(sectionTitle, item)),
    [currentRolePermissionSet],
  )

  const ensureMappedProjectPermission = useCallback(
    (sectionTitle: string, item: string, deniedTip?: string) => {
      if (!ensureProjectEditable()) return false
      if (hasMappedProjectPermission(sectionTitle, item)) return true
      message.warning(deniedTip ?? `当前角色暂无「${item}」权限`)
      return false
    },
    [ensureProjectEditable, hasMappedProjectPermission],
  )

  const canConfigureOverviewReminders =
    hasMappedProjectPermission('项目权限', '基本设置') && !projectReadonly
  const canEditProjectStatusFields =
    !projectReadonly && hasMappedProjectPermission('项目权限', '修改项目状态')
  const canEditProjectBasicFields =
    !projectReadonly && hasMappedProjectPermission('项目权限', '基本设置')
  const canEditTargetStatusFields =
    !projectReadonly && hasMappedProjectPermission('目标管理', '修改目标状态')
  const canEditTaskStatusFields =
    !projectReadonly && hasMappedProjectPermission('任务管理', '修改任务状态')
  const canEditTaskInfoFields =
    !projectReadonly && hasMappedProjectPermission('任务管理', '编辑任务')
  const canCreateTaskOrSubtask =
    !projectReadonly && hasMappedProjectPermission('任务管理', '新建任务')
  const canManageTaskEditorAttachments =
    !projectReadonly && hasMappedProjectPermission('任务管理', '管理附件')
  const canDeleteTarget = !projectReadonly && hasMappedProjectPermission('目标管理', '删除目标')
  const canCreateTarget = !projectReadonly && hasMappedProjectPermission('目标管理', '新建目标')
  const canLinkTargetTasks =
    !projectReadonly && hasMappedProjectPermission('目标管理', '任务关联')
  const canManageTargetTabAttachments =
    !projectReadonly && hasMappedProjectPermission('目标管理', '管理附件')
  const canEditTargetDetailFields =
    !projectReadonly && hasMappedProjectPermission('目标管理', '编辑目标')
  const canDeleteTask = !projectReadonly && hasMappedProjectPermission('任务管理', '删除任务')
  const canManageProjectMembers =
    !projectReadonly && hasMappedProjectPermission('项目权限', '成员管理')
  const canManageProjectRoles =
    !projectReadonly && hasMappedProjectPermission('项目权限', '角色管理')
  const canArchiveProject =
    !projectReadonlyByPermission && hasMappedProjectPermission('项目权限', '归档项目')
  const canDeleteProject =
    !projectReadonlyByPermission && hasMappedProjectPermission('项目权限', '删除项目')

  return {
    hasMappedProjectPermission,
    ensureMappedProjectPermission,
    canConfigureOverviewReminders,
    canEditProjectStatusFields,
    canEditProjectBasicFields,
    canEditTargetStatusFields,
    canEditTaskStatusFields,
    canEditTaskInfoFields,
    canCreateTaskOrSubtask,
    canManageTaskEditorAttachments,
    canDeleteTarget,
    canCreateTarget,
    canLinkTargetTasks,
    canManageTargetTabAttachments,
    canEditTargetDetailFields,
    canDeleteTask,
    canManageProjectMembers,
    canManageProjectRoles,
    canArchiveProject,
    canDeleteProject,
  }
}
