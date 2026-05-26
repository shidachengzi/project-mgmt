import { prisma } from '@/lib/prisma'
import { ensureProjectRbacSeeds } from '@/lib/projectRbacBootstrap'

/** 内置项目角色，不可删除 */
export const BUILTIN_PROJECT_ROLE_KEYS = new Set(['admin', 'normal', 'observer'])

export const isBuiltinProjectRoleKey = (key: string) => BUILTIN_PROJECT_ROLE_KEYS.has(key)

const resolveDefaultRoleKey = async (projectId: string) => {
  const marked = await prisma.projectRole.findFirst({ where: { projectId, isDefault: true }, select: { key: true } })
  if (marked) return marked.key
  return 'normal'
}

export const listProjectRolesWithPermissions = async (projectId: string) => {
  await ensureProjectRbacSeeds(projectId)
  const roles = await prisma.projectRole.findMany({
    where: { projectId },
    include: {
      permissions: {
        include: { permission: true },
      },
    },
    orderBy: [{ isDefault: 'desc' }, { key: 'asc' }],
  })

  return roles.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    note: role.note,
    isDefault: role.isDefault,
    permissionKeys: role.permissions.map((p) => p.permission.key),
  }))
}

export const createProjectRole = async (
  projectId: string,
  input: { key: string; name: string; note?: string | null },
) => {
  await ensureProjectRbacSeeds(projectId)
  const key = input.key.trim().slice(0, 64)
  const name = input.name.trim().slice(0, 191)
  if (!key || !name) return { error: 'INVALID_INPUT' as const }
  const dup = await prisma.projectRole.findUnique({
    where: { projectId_key: { projectId, key } },
  })
  if (dup) return { error: 'DUPLICATE_KEY' as const }
  const role = await prisma.projectRole.create({
    data: {
      projectId,
      key,
      name,
      note: input.note?.trim() ? input.note.trim().slice(0, 191) : null,
      isDefault: false,
    },
  })
  return {
    role: {
      id: role.id,
      key: role.key,
      name: role.name,
      isDefault: role.isDefault,
      permissionKeys: [] as string[],
    },
  }
}

export const updateProjectRolePermissions = async (projectId: string, roleId: string, permissionKeys: string[]) => {
  await ensureProjectRbacSeeds(projectId)
  const role = await prisma.projectRole.findFirst({ where: { id: roleId, projectId } })
  if (!role) return { error: 'NOT_FOUND' as const }
  if (role.key === 'admin') return { error: 'FORBIDDEN_ROLE' as const }

  const permissions = await prisma.projectPermission.findMany({
    where: {
      projectId,
      key: { in: permissionKeys },
    },
    select: { id: true, key: true },
  })

  await prisma.$transaction([
    prisma.projectRolePermission.deleteMany({ where: { roleId } }),
    ...(permissions.length
      ? [
          prisma.projectRolePermission.createMany({
            data: permissions.map((p) => ({ roleId, permissionId: p.id })),
          }),
        ]
      : []),
  ])

  return { roleId, permissionKeys: permissions.map((p) => p.key) }
}

export const assignProjectMemberRole = async (projectId: string, userId: string, roleKey: string) => {
  await ensureProjectRbacSeeds(projectId)
  const role = await prisma.projectRole.findUnique({
    where: { projectId_key: { projectId, key: roleKey } },
  })
  if (!role) return { error: 'ROLE_NOT_FOUND' as const }

  const existingMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true },
  })
  const wasNewMember = !existingMember

  const member = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: {},
    create: { projectId, userId },
  })

  await prisma.$transaction([
    prisma.projectMemberRole.deleteMany({ where: { memberId: member.id } }),
    prisma.projectMemberRole.create({
      data: { memberId: member.id, roleId: role.id },
    }),
  ])

  return { projectId, userId, roleKey: role.key, wasNewMember }
}

export const setProjectDefaultRole = async (projectId: string, roleId: string) => {
  await ensureProjectRbacSeeds(projectId)
  const role = await prisma.projectRole.findFirst({ where: { id: roleId, projectId } })
  if (!role) return { error: 'NOT_FOUND' as const }
  await prisma.$transaction([
    prisma.projectRole.updateMany({ where: { projectId }, data: { isDefault: false } }),
    prisma.projectRole.update({ where: { id: roleId }, data: { isDefault: true } }),
  ])
  return { roleId, roleKey: role.key }
}

export const deleteProjectRole = async (projectId: string, roleId: string) => {
  await ensureProjectRbacSeeds(projectId)
  const role = await prisma.projectRole.findFirst({ where: { id: roleId, projectId } })
  if (!role) return { error: 'NOT_FOUND' as const }
  if (isBuiltinProjectRoleKey(role.key)) return { error: 'BUILTIN_ROLE' as const }

  const fallbackKey = role.isDefault ? 'normal' : await resolveDefaultRoleKey(projectId)
  const fallbackRole = await prisma.projectRole.findUnique({
    where: { projectId_key: { projectId, key: fallbackKey } },
  })
  if (!fallbackRole) return { error: 'NO_DEFAULT_ROLE' as const }

  if (role.isDefault) {
    await prisma.$transaction([
      prisma.projectRole.updateMany({ where: { projectId }, data: { isDefault: false } }),
      prisma.projectRole.update({ where: { id: fallbackRole.id }, data: { isDefault: true } }),
    ])
  }

  const memberRoles = await prisma.projectMemberRole.findMany({
    where: { roleId },
    include: { member: { select: { userId: true } } },
  })
  for (const mr of memberRoles) {
    await assignProjectMemberRole(projectId, mr.member.userId, fallbackRole.key)
  }

  await prisma.$transaction([
    prisma.projectMemberRole.deleteMany({ where: { roleId } }),
    prisma.projectRolePermission.deleteMany({ where: { roleId } }),
    prisma.projectRole.delete({ where: { id: roleId } }),
  ])

  return { deletedRoleId: roleId, fallbackRoleKey: fallbackRole.key }
}

