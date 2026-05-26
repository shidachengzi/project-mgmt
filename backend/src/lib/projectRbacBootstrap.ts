import { prisma } from './prisma'
import { PROJECT_PERMISSION_SECTIONS, buildProjectPermissionKey } from './permissionMap'

export const ensureProjectRbacSeeds = async (projectId: string) => {
  const project = await prisma.project.upsert({
    where: { id: projectId },
    update: {},
    create: {
      id: projectId,
      title: projectId,
      visibility: 'private',
    },
  })

  const permissionKeys = PROJECT_PERMISSION_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({
      key: buildProjectPermissionKey(section.title, item),
      sectionTitle: section.title,
      itemLabel: item,
    })),
  )

  for (const permission of permissionKeys) {
    await prisma.projectPermission.upsert({
      where: { projectId_key: { projectId, key: permission.key } },
      update: { sectionTitle: permission.sectionTitle, itemLabel: permission.itemLabel },
      create: {
        projectId,
        key: permission.key,
        sectionTitle: permission.sectionTitle,
        itemLabel: permission.itemLabel,
      },
    })
  }

  const defaultRoles = [
    { key: 'admin', name: '管理员', isDefault: false },
    { key: 'normal', name: '普通成员', isDefault: true },
    { key: 'observer', name: '只读成员', isDefault: false },
  ]
  for (const role of defaultRoles) {
    await prisma.projectRole.upsert({
      where: { projectId_key: { projectId, key: role.key } },
      update: { name: role.name },
      create: { projectId, key: role.key, name: role.name, isDefault: role.isDefault },
    })
  }

  const defaultCount = await prisma.projectRole.count({ where: { projectId, isDefault: true } })
  if (defaultCount !== 1) {
    await prisma.projectRole.updateMany({ where: { projectId }, data: { isDefault: false } })
    await prisma.projectRole.update({
      where: { projectId_key: { projectId, key: 'normal' } },
      data: { isDefault: true },
    })
  }

  const adminRole = await prisma.projectRole.findUnique({
    where: { projectId_key: { projectId, key: 'admin' } },
  })
  if (!adminRole) return project

  const allPermissions = await prisma.projectPermission.findMany({
    where: { projectId },
    select: { id: true },
  })
  for (const permission of allPermissions) {
    await prisma.projectRolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: permission.id },
    })
  }

  return project
}

