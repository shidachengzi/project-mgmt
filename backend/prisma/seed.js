const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

const systemPermissions = [
  { key: 'project.create_public', label: '创建公开项目' },
  { key: 'project.create_private', label: '创建私有项目' },
  { key: 'project.manage_public', label: '管理公开项目' },
  { key: 'project.report', label: '查看报表' },
  { key: 'calendar.create_public', label: '新建公开日历' },
  { key: 'calendar.create_private', label: '新建私有日历' },
  { key: 'calendar.manage_public', label: '管理公开日历' },
  { key: 'member.manage', label: '成员管理' },
  { key: 'role.manage', label: '角色管理' },
  { key: 'notification.broadcast', label: '全员通知' },
  { key: 'system.config', label: '系统配置' },
]

const roleDefs = [
  { key: 'owner', name: '所有者' },
  { key: 'admin', name: '管理员' },
  { key: 'member', name: '普通成员' },
]

async function main() {
  for (const perm of systemPermissions) {
    await prisma.systemPermission.upsert({
      where: { key: perm.key },
      update: { label: perm.label },
      create: perm,
    })
  }

  const gDefault = await prisma.systemRoleGroup.upsert({
    where: { key: 'default' },
    update: { name: '默认' },
    create: { key: 'default', name: '默认', sortOrder: 0 },
  })
  await prisma.systemRoleGroup.upsert({
    where: { key: 'job' },
    update: { name: '职务' },
    create: { key: 'job', name: '职务', sortOrder: 1 },
  })

  for (const role of roleDefs) {
    await prisma.systemRole.upsert({
      where: { key: role.key },
      update: { name: role.name, groupId: gDefault.id },
      create: { ...role, groupId: gDefault.id },
    })
  }

  const allPerms = await prisma.systemPermission.findMany()
  const ownerRole = await prisma.systemRole.findUnique({ where: { key: 'owner' } })
  const adminRole = await prisma.systemRole.findUnique({ where: { key: 'admin' } })
  const memberRole = await prisma.systemRole.findUnique({ where: { key: 'member' } })

  if (!ownerRole || !adminRole || !memberRole) {
    throw new Error('system roles seed failed')
  }

  for (const perm of allPerms) {
    await prisma.roleSystemPermission.upsert({
      where: { roleId_permissionId: { roleId: ownerRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: ownerRole.id, permissionId: perm.id },
    })
  }

  const adminPermKeys = [
    'project.create_public',
    'project.create_private',
    'project.manage_public',
    'project.report',
    'calendar.create_public',
    'calendar.create_private',
    'calendar.manage_public',
    'member.manage',
    'role.manage',
    'notification.broadcast',
    'system.config',
  ]
  for (const key of adminPermKeys) {
    const perm = allPerms.find((p) => p.key === key)
    if (!perm) continue
    await prisma.roleSystemPermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: perm.id },
    })
  }

  const defaultPassword = await bcrypt.hash('123456', 10)

  const depPm = await prisma.department.upsert({
    where: { id: 'seed-dep-pm' },
    update: { name: '项目管理部' },
    create: { id: 'seed-dep-pm', name: '项目管理部', parentId: null, sortOrder: 0 },
  })
  await prisma.department.upsert({
    where: { id: 'seed-dep-rd' },
    update: { name: '研发部' },
    create: { id: 'seed-dep-rd', name: '研发部', parentId: null, sortOrder: 1 },
  })

  const seedJobTitles = [
    'CEO',
    '技术总监',
    '运营总监',
    '财务总监',
    '人力资源总监',
    '产品总监',
    '设计总监',
    '市场总监',
  ]
  for (let i = 0; i < seedJobTitles.length; i++) {
    const name = seedJobTitles[i]
    await prisma.jobTitle.upsert({
      where: { name },
      update: { sortOrder: i },
      create: { name, sortOrder: i },
    })
  }

  const ownerUser = await prisma.user.upsert({
    where: { email: 'owner@example.com' },
    update: {
      name: 'owner',
      username: 'owner',
      employeeCode: 'KN0000',
      jobTitle: '项目经理',
      departmentId: depPm.id,
      passwordHash: defaultPassword,
      status: 'active',
    },
    create: {
      email: 'owner@example.com',
      name: 'owner',
      username: 'owner',
      employeeCode: 'KN0000',
      jobTitle: '项目经理',
      departmentId: depPm.id,
      passwordHash: defaultPassword,
      status: 'active',
    },
  })

  await prisma.userSystemRole.upsert({
    where: { userId_roleId: { userId: ownerUser.id, roleId: ownerRole.id } },
    update: {},
    create: { userId: ownerUser.id, roleId: ownerRole.id },
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })

