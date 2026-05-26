import { useAuthStore } from '../auth/model/useAuthStore'
import { useBackendDataStore } from '../workspace/model/backendDataStore'
import { useMemo } from 'react'

export type SystemPermissionKey =
  | 'project.create_public'
  | 'project.create_private'
  | 'project.manage_public'
  | 'project.report'
  | 'calendar.create_public'
  | 'calendar.create_private'
  | 'calendar.manage_public'
  | 'member.manage'
  | 'role.manage'
  | 'notification.broadcast'
  | 'system.config'

export function getUserSystemRoleKeys(_userId: string | null): string[] {
  const st = useBackendDataStore.getState()
  if (!st.systemLoaded) return []
  return st.systemRoleKeys
}

export function getUserSystemPermissions(_userId: string | null): Set<SystemPermissionKey> {
  const st = useBackendDataStore.getState()
  if (!st.systemLoaded) return new Set()
  return new Set(st.systemPermissionKeys as SystemPermissionKey[])
}

export function hasSystemPermission(_userId: string | null, perm: SystemPermissionKey): boolean {
  const st = useBackendDataStore.getState()
  if (!st.systemLoaded) return false
  return st.systemPermissionKeys.includes(perm)
}

/**
 * 当前登录用户是否具备某项系统权限（须先完成 bootstrap 的 systemLoaded）。
 */
export function useHasSystemPermission(perm: SystemPermissionKey): boolean {
  const authed = useAuthStore(s => s.authedUserId)
  const backendKeys = useBackendDataStore(s => s.systemPermissionKeys)
  const backendLoaded = useBackendDataStore(s => s.systemLoaded)
  if (!authed || !backendLoaded) return false
  return backendKeys.includes(perm)
}

/** 系统角色为 owner / admin（管理员及以上），用于通讯录查看他人任务等敏感信息 */
export function useHasSystemAdminOrAbove(): boolean {
  const authed = useAuthStore(s => s.authedUserId)
  const systemLoaded = useBackendDataStore(s => s.systemLoaded)
  const systemRoleKeys = useBackendDataStore(s => s.systemRoleKeys)
  return useMemo(() => {
    if (!authed || !systemLoaded) return false
    return systemRoleKeys.includes('owner') || systemRoleKeys.includes('admin')
  }, [authed, systemLoaded, systemRoleKeys])
}

export function useCanOpenAdminConsole(): boolean {
  const canManageMembers = useHasSystemPermission('member.manage')
  const canManageRoles = useHasSystemPermission('role.manage')
  const canManageSystem = useHasSystemPermission('system.config')
  return canManageMembers || canManageRoles || canManageSystem
}
