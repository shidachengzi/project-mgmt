import { prisma } from './prisma'
import { allProjectPermissionKeys } from './permissionMap'

export const getUserSystemRoles = async (userId: string) => {
  const rows = await prisma.userSystemRole.findMany({
    where: { userId },
    include: { role: true },
  })
  return rows.map((r) => r.role)
}

/** 系统角色 owner / admin，与前端通讯录「管理员及以上」口径一致 */
export const hasSystemAdminOrAbove = async (userId: string) => {
  const roles = await getUserSystemRoles(userId)
  return roles.some((r) => r.key === 'owner' || r.key === 'admin')
}

export const getUserSystemPermissionKeys = async (userId: string) => {
  const roles = await getUserSystemRoles(userId)
  if (roles.some((r) => r.key === 'owner')) {
    const allPerms = await prisma.systemPermission.findMany({ select: { key: true } })
    return allPerms.map((p) => p.key)
  }

  const roleIds = roles.map((r) => r.id)
  if (!roleIds.length) return []

  const mappings = await prisma.roleSystemPermission.findMany({
    where: { roleId: { in: roleIds } },
    include: { permission: true },
  })
  return Array.from(new Set(mappings.map((m) => m.permission.key)))
}

export const getUserProjectRoleKeys = async (projectId: string, userId: string) => {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { roles: { include: { role: true } } },
  })
  if (!member) return []
  return member.roles.map((r) => r.role.key)
}

export const getUserProjectPermissionKeys = async (projectId: string, userId: string) => {
  const roleKeys = await getUserProjectRoleKeys(projectId, userId)
  if (roleKeys.includes('admin')) {
    return allProjectPermissionKeys()
  }

  if (!roleKeys.length) return []

  const roles = await prisma.projectRole.findMany({
    where: { projectId, key: { in: roleKeys } },
    include: {
      permissions: { include: { permission: true } },
    },
  })

  return Array.from(new Set(roles.flatMap((r) => r.permissions.map((p) => p.permission.key))))
}

export const hasSystemPermission = async (userId: string, key: string) => {
  const perms = await getUserSystemPermissionKeys(userId)
  return perms.includes(key)
}

export const hasProjectPermission = async (projectId: string, userId: string, key: string) => {
  const perms = await getUserProjectPermissionKeys(projectId, userId)
  return perms.includes(key)
}

