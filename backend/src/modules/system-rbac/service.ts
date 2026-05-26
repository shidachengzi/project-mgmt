import { prisma } from '@/lib/prisma'

export const listSystemRolesWithPermissions = async () => {
  const roles = await prisma.systemRole.findMany({
    include: {
      permissions: {
        include: { permission: true },
      },
    },
    orderBy: { key: 'asc' },
  })

  return roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    permissionKeys: r.permissions.map((p) => p.permission.key),
  }))
}

export const updateSystemRolePermissions = async (roleId: string, permissionKeys: string[]) => {
  const role = await prisma.systemRole.findUnique({ where: { id: roleId } })
  if (!role) return { error: 'NOT_FOUND' as const }
  if (role.key === 'owner') return { error: 'FORBIDDEN_ROLE' as const }

  const perms = await prisma.systemPermission.findMany({
    where: { key: { in: permissionKeys } },
    select: { id: true, key: true },
  })

  await prisma.$transaction([
    prisma.roleSystemPermission.deleteMany({ where: { roleId } }),
    ...(perms.length
      ? [
          prisma.roleSystemPermission.createMany({
            data: perms.map((p) => ({ roleId, permissionId: p.id })),
          }),
        ]
      : []),
  ])

  return { roleId, permissionKeys: perms.map((p) => p.key) }
}

