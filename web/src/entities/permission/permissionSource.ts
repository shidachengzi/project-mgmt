import { getUserSystemPermissions, getUserSystemRoleKeys } from './systemPermissions'
import { fetchProjectPermissionSnapshot, fetchSystemPermissionSnapshot } from './permissionBridge'

export type PermissionDataSource = 'backend' | 'local'

export type SystemPermissionResolved = {
  source: PermissionDataSource
  roleKeys: string[]
  permissionKeys: string[]
}

export async function resolveSystemPermissions(userId: string | null): Promise<SystemPermissionResolved> {
  const remote = await fetchSystemPermissionSnapshot()
  if (remote) {
    return {
      source: 'backend',
      roleKeys: remote.roleKeys,
      permissionKeys: remote.permissionKeys,
    }
  }

  return {
    source: 'local',
    roleKeys: getUserSystemRoleKeys(userId),
    permissionKeys: Array.from(getUserSystemPermissions(userId)).sort(),
  }
}

export async function resolveProjectPermissions(projectId: string): Promise<{ source: PermissionDataSource; roleKeys: string[]; permissionKeys: string[] } | null> {
  const remote = await fetchProjectPermissionSnapshot(projectId)
  if (!remote) return null
  return {
    source: 'backend',
    roleKeys: remote.roleKeys,
    permissionKeys: remote.permissionKeys,
  }
}

