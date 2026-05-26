import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { pickPrimaryRoleKey } from '@/modules/org/systemRoleAdminService'

/** 与前端部门树根节点 id 对齐 */
export const DEPARTMENT_ROOT_ID = 'dep-root-org'

export type DeptDTO = {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  children: DeptDTO[]
}

export type MemberDTO = {
  id: string
  name: string
  username: string | null
  email: string | null
  mobile: string | null
  employeeCode: string | null
  jobTitle: string | null
  departmentId: string | null
  departmentName: string | null
  status: string
  systemRoleKeys: string[]
}

function normalizeParentId(parentId: string | null | undefined): string | null {
  if (!parentId || parentId === DEPARTMENT_ROOT_ID) return null
  return parentId
}

function buildTree(
  flat: { id: string; name: string; parentId: string | null; sortOrder: number }[],
): DeptDTO[] {
  const byId = new Map<string, DeptDTO>()
  for (const r of flat) {
    byId.set(r.id, { id: r.id, name: r.name, parentId: r.parentId, sortOrder: r.sortOrder, children: [] })
  }
  const roots: DeptDTO[] = []
  for (const r of flat) {
    const node = byId.get(r.id)!
    if (!r.parentId) {
      roots.push(node)
    } else {
      const p = byId.get(r.parentId)
      if (p) p.children.push(node)
      else roots.push(node)
    }
  }
  const sortNested = (nodes: DeptDTO[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN'))
    nodes.forEach(n => sortNested(n.children))
  }
  sortNested(roots)
  return roots
}

export function wrapDepartmentTree(nodes: DeptDTO[]): DeptDTO {
  return {
    id: DEPARTMENT_ROOT_ID,
    name: '组织架构',
    parentId: null,
    sortOrder: 0,
    children: nodes,
  }
}

export async function getDepartmentTreeWrapped(): Promise<DeptDTO> {
  const flat = await prisma.department.findMany({
    orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })
  return wrapDepartmentTree(
    buildTree(flat.map(d => ({ id: d.id, name: d.name, parentId: d.parentId, sortOrder: d.sortOrder }))),
  )
}

export async function createDepartment(input: { parentId: string | null | undefined; name: string }) {
  const name = input.name.trim()
  if (!name) return { error: 'EMPTY_NAME' as const }
  const parentId = normalizeParentId(input.parentId ?? null)
  if (parentId) {
    const p = await prisma.department.findUnique({ where: { id: parentId } })
    if (!p) return { error: 'PARENT_NOT_FOUND' as const }
  }
  const agg = await prisma.department.aggregate({
    where: { parentId },
    _max: { sortOrder: true },
  })
  const sortOrder = (agg._max.sortOrder ?? -1) + 1
  const d = await prisma.department.create({
    data: { name, parentId, sortOrder },
  })
  return { department: d }
}

export async function updateDepartment(id: string, input: { name: string }) {
  if (id === DEPARTMENT_ROOT_ID) return { error: 'FORBIDDEN' as const }
  const d = await prisma.department.findUnique({ where: { id } })
  if (!d) return { error: 'NOT_FOUND' as const }
  const name = input.name.trim()
  if (!name) return { error: 'EMPTY_NAME' as const }
  await prisma.department.update({ where: { id }, data: { name } })
  return { ok: true as const }
}

export async function deleteDepartment(id: string) {
  if (id === DEPARTMENT_ROOT_ID) return { error: 'FORBIDDEN' as const }
  const d = await prisma.department.findUnique({
    where: { id },
    include: { _count: { select: { children: true } } },
  })
  if (!d) return { error: 'NOT_FOUND' as const }
  if (d._count.children > 0) return { error: 'HAS_CHILDREN' as const }
  await prisma.$transaction([
    prisma.user.updateMany({ where: { departmentId: id }, data: { departmentId: null } }),
    prisma.department.delete({ where: { id } }),
  ])
  return { ok: true as const }
}

export async function reorderDepartments(input: { parentId: string | null | undefined; orderedIds: string[] }) {
  const parentId = normalizeParentId(input.parentId ?? null)
  const ids = input.orderedIds.filter(Boolean)
  if (!ids.length) return { ok: true as const }
  const rows = await prisma.department.findMany({ where: { id: { in: ids } } })
  if (rows.length !== ids.length) return { error: 'NOT_FOUND' as const }
  if (rows.some(r => r.parentId !== parentId)) return { error: 'PARENT_MISMATCH' as const }
  await prisma.$transaction(
    ids.map((id, idx) => prisma.department.update({ where: { id }, data: { sortOrder: idx } })),
  )
  return { ok: true as const }
}

export async function listMembers(q?: string): Promise<MemberDTO[]> {
  const term = (q ?? '').trim()
  const where =
    term.length === 0
      ? {}
      : {
          OR: [
            { name: { contains: term } },
            { username: { contains: term } },
            { email: { contains: term } },
            { mobile: { contains: term } },
            { employeeCode: { contains: term } },
          ],
        }
  const rows = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      mobile: true,
      employeeCode: true,
      jobTitle: true,
      departmentId: true,
      status: true,
      department: { select: { name: true } },
      systemRoles: { select: { role: { select: { key: true } } } },
    },
    orderBy: [{ name: 'asc' }],
    take: 2000,
  })
  return rows.map(r => {
    const systemRoleKeys = r.systemRoles.map(s => s.role.key)
    return {
      id: r.id,
      name: r.name,
      username: r.username,
      email: r.email,
      mobile: r.mobile,
      employeeCode: r.employeeCode,
      jobTitle: r.jobTitle,
      departmentId: r.departmentId,
      departmentName: r.department?.name ?? null,
      status: r.status,
      systemRoleKeys,
    }
  })
}

export async function createMember(input: {
  name: string
  username: string
  password: string
  email?: string | null
  mobile?: string | null
  employeeCode?: string | null
  jobTitle?: string | null
  departmentId?: string | null
}) {
  const name = input.name.trim()
  const username = input.username.trim()
  if (!name || !username || !input.password) return { error: 'INVALID' as const }
  const email = input.email?.trim() || null
  const mobile = input.mobile?.trim() || null

  let departmentId = input.departmentId?.trim() || null
  if (!departmentId || departmentId === '__none__') departmentId = null
  if (departmentId) {
    const ok = await prisma.department.findUnique({ where: { id: departmentId } })
    if (!ok) return { error: 'DEPT_NOT_FOUND' as const }
  }

  const passwordHash = await bcrypt.hash(input.password, 10)
  try {
    const u = await prisma.user.create({
      data: {
        name,
        username,
        email,
        mobile,
        employeeCode: input.employeeCode?.trim() || null,
        jobTitle: input.jobTitle?.trim() || null,
        departmentId,
        passwordHash,
        status: 'active',
      },
    })
    const memberRole = await prisma.systemRole.findUnique({ where: { key: 'member' } })
    if (memberRole) {
      await prisma.userSystemRole.create({
        data: { userId: u.id, roleId: memberRole.id },
      })
    }
    return { user: { id: u.id } }
  } catch {
    return { error: 'DUPLICATE' as const }
  }
}

export async function updateMember(
  id: string,
  input: {
    name?: string
    username?: string
    employeeCode?: string | null
    email?: string | null
    mobile?: string | null
    jobTitle?: string | null
    departmentId?: string | null
    status?: string
  },
) {
  const u = await prisma.user.findUnique({ where: { id } })
  if (!u) return { error: 'NOT_FOUND' as const }

  let departmentId: string | null | undefined = input.departmentId
  if (departmentId === '__none__' || departmentId === '') departmentId = null
  if (departmentId) {
    const ok = await prisma.department.findUnique({ where: { id: departmentId } })
    if (!ok) return { error: 'DEPT_NOT_FOUND' as const }
  }

  const data: {
    name?: string
    username?: string
    employeeCode?: string | null
    email?: string | null
    mobile?: string | null
    jobTitle?: string | null
    departmentId?: string | null
    status?: string
  } = {}
  if (input.name !== undefined) data.name = input.name.trim()
  if (input.username !== undefined) {
    const username = input.username.trim()
    if (!username) return { error: 'INVALID' as const }
    data.username = username
  }
  if (input.employeeCode !== undefined) data.employeeCode = input.employeeCode?.trim() || null
  if (input.email !== undefined) data.email = input.email?.trim() || null
  if (input.mobile !== undefined) data.mobile = input.mobile?.trim() || null
  if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle?.trim() || null
  if (departmentId !== undefined) data.departmentId = departmentId
  if (input.status !== undefined) data.status = input.status

  try {
    await prisma.user.update({ where: { id }, data })
    return { ok: true as const }
  } catch {
    return { error: 'DUPLICATE' as const }
  }
}
