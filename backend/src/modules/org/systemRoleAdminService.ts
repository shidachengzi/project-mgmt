import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { getUserSystemRoles } from '@/lib/rbac'

const ROLE_PRIORITY = ['owner', 'admin', 'member'] as const

const BUILTIN_ROLE_KEYS = new Set(['owner', 'admin', 'member'])

export function pickPrimaryRoleKey(keys: string[]): string {
  for (const k of ROLE_PRIORITY) {
    if (keys.includes(k)) return k
  }
  return keys[0] ?? 'member'
}

function normalizeSlugKey(raw: string, maxLen: number): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen)
  return s
}

function generateRoleKey(): string {
  return `role_${randomBytes(10).toString('hex')}`
}

function generateGroupKeyFromName(displayName: string): string {
  const slug = normalizeSlugKey(displayName, 48)
  if (slug && slug !== 'default' && slug !== 'job') return slug.length <= 64 ? slug : slug.slice(0, 64)
  return `g_${randomBytes(6).toString('hex')}`
}

export async function getSystemRolesAdminSnapshot() {
  const groups = await prisma.systemRoleGroup.findMany({
    orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
  })

  const roles = await prisma.systemRole.findMany({
    orderBy: { key: 'asc' },
    include: {
      permissions: { include: { permission: true } },
      users: { select: { userId: true } },
      group: true,
    },
  })

  const membersByRole: Record<string, string[]> = {}
  const permissionsByRole: Record<string, string[]> = {}
  for (const r of roles) {
    membersByRole[r.key] = r.users.map(u => u.userId)
    permissionsByRole[r.key] = r.permissions.map(p => p.permission.key)
  }

  return {
    groups: groups.map(g => ({ key: g.key, name: g.name })),
    roles: roles.map(r => ({
      key: r.key,
      name: r.name,
      note: r.note ?? '',
      groupKey: r.group?.key ?? 'default',
      isDefault: BUILTIN_ROLE_KEYS.has(r.key),
    })),
    membersByRole,
    permissionsByRole,
  }
}

export async function replaceRolePermissions(roleKey: string, permissionKeys: string[]) {
  if (roleKey === 'owner') return { error: 'OWNER_FIXED' as const }
  const role = await prisma.systemRole.findUnique({ where: { key: roleKey } })
  if (!role) return { error: 'ROLE_NOT_FOUND' as const }

  const uniq = Array.from(new Set(permissionKeys.filter(Boolean)))
  const perms = await prisma.systemPermission.findMany({ where: { key: { in: uniq } } })
  if (perms.length !== uniq.length) return { error: 'INVALID_PERMISSION' as const }

  await prisma.$transaction([
    prisma.roleSystemPermission.deleteMany({ where: { roleId: role.id } }),
    ...perms.map(p =>
      prisma.roleSystemPermission.create({
        data: { roleId: role.id, permissionId: p.id },
      }),
    ),
  ])
  return { ok: true as const }
}

/**
 * 将用户系统角色设为单一角色（删除原有全部关联后写入一条）。
 */
export async function setUserPrimarySystemRole(actorUserId: string, targetUserId: string, roleKey: string) {
  const actorRoles = await getUserSystemRoles(actorUserId)
  const actorKeys = actorRoles.map(r => r.key)

  if (roleKey === 'owner' && !actorKeys.includes('owner')) {
    return { error: 'ONLY_OWNER_CAN_ASSIGN_OWNER' as const }
  }

  const targetRole = await prisma.systemRole.findUnique({ where: { key: roleKey } })
  if (!targetRole) return { error: 'ROLE_NOT_FOUND' as const }

  const targetLinks = await prisma.userSystemRole.findMany({
    where: { userId: targetUserId },
    include: { role: true },
  })
  const hadOwner = targetLinks.some(l => l.role.key === 'owner')

  if (hadOwner && roleKey !== 'owner') {
    const ownerRole = await prisma.systemRole.findUnique({ where: { key: 'owner' } })
    if (ownerRole) {
      const ownerCount = await prisma.userSystemRole.count({ where: { roleId: ownerRole.id } })
      if (ownerCount <= 1) return { error: 'LAST_OWNER' as const }
    }
  }

  await prisma.$transaction([
    prisma.userSystemRole.deleteMany({ where: { userId: targetUserId } }),
    prisma.userSystemRole.create({
      data: { userId: targetUserId, roleId: targetRole.id },
    }),
  ])

  return { ok: true as const }
}

export async function createSystemRoleGroup(input: { name: string; key?: string | null }) {
  const name = String(input.name ?? '').trim()
  if (!name) return { error: 'EMPTY_NAME' as const }
  if (name === '默认') return { error: 'RESERVED_NAME' as const }

  let key: string
  if (input.key != null && String(input.key).trim()) {
    key = normalizeSlugKey(String(input.key), 64)
    if (!key) return { error: 'INVALID_KEY' as const }
  } else if (name === '职务') {
    key = 'job'
  } else {
    key = generateGroupKeyFromName(name)
  }

  if (key === 'default') return { error: 'RESERVED_KEY' as const }

  const exists = await prisma.systemRoleGroup.findUnique({ where: { key } })
  if (exists) return { error: 'DUPLICATE_KEY' as const }

  const maxSort = await prisma.systemRoleGroup.aggregate({ _max: { sortOrder: true } })
  const sortOrder = (maxSort._max.sortOrder ?? 0) + 1

  const group = await prisma.systemRoleGroup.create({
    data: {
      key,
      name: name === '职务' ? '职务' : name,
      sortOrder,
    },
  })
  return { ok: true as const, group }
}

export async function createCustomSystemRole(input: {
  name: string
  groupKey: string
  note?: string | null
  key?: string | null
}) {
  const name = String(input.name ?? '').trim()
  if (!name) return { error: 'EMPTY_NAME' as const }

  const groupKey = String(input.groupKey ?? '').trim()
  if (!groupKey) return { error: 'GROUP_KEY_REQUIRED' as const }

  const group = await prisma.systemRoleGroup.findUnique({ where: { key: groupKey } })
  if (!group) return { error: 'GROUP_NOT_FOUND' as const }

  let key = input.key != null && String(input.key).trim() ? normalizeSlugKey(String(input.key), 64) : ''
  if (!key) key = generateRoleKey()
  if (!key) return { error: 'INVALID_KEY' as const }

  if (BUILTIN_ROLE_KEYS.has(key)) return { error: 'RESERVED_ROLE_KEY' as const }

  const dup = await prisma.systemRole.findUnique({ where: { key } })
  if (dup) return { error: 'DUPLICATE_ROLE_KEY' as const }

  const noteRaw = String(input.note ?? '').trim()
  const note = noteRaw.length ? noteRaw.slice(0, 191) : null

  const role = await prisma.systemRole.create({
    data: {
      key,
      name: name.slice(0, 191),
      note,
      groupId: group.id,
    },
  })
  return { ok: true as const, role }
}
