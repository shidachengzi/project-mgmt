import type { OrgDepartmentNode, OrgMember } from '../../entities/org/model/types'
import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

/** GET /api/users 返回结构（与 Prisma select 一致） */
export type DirectoryUserDTO = {
  id: string
  name: string
  email: string | null
  mobile: string | null
  username: string | null
  employeeCode: string | null
  jobTitle: string | null
  department: { id: string; name: string } | null
}

const avatarPalette = ['#f58aa8', '#7fd1ae', '#69b1ff', '#ffd666', '#b37feb', '#5c8df6', '#95de64']

function hashPick(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  return avatarPalette[Math.abs(h) % avatarPalette.length]
}

/** 企业通讯录目录（任意登录用户可查），用于选人下拉 */
export function directoryUserDtoToOrgMember(u: DirectoryUserDTO): OrgMember {
  const department = u.department?.name?.trim() || '未分配部门'
  const deptId = u.department?.id ?? null
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    code: u.username ?? '',
    phone: u.mobile ?? '',
    email: u.email ?? '',
    departmentId: deptId,
    department,
    title: u.jobTitle ?? '',
    letter: u.name.slice(0, 1).toUpperCase(),
    avatarText: u.name.slice(0, 2).toUpperCase(),
    avatarColor: hashPick(u.id),
    disabled: false,
  }
}

/** 由目录成员生成简易部门树（无管理员「部门管理」接口时使用） */
export function buildDirectoryDepartmentTree(members: OrgMember[]): OrgDepartmentNode[] {
  const byDeptId = new Map<string, { id: string; name: string; memberIds: string[] }>()
  for (const m of members) {
    const id = m.departmentId?.trim() || 'dep-unassigned'
    const name = m.department?.trim() || '未分配部门'
    if (!byDeptId.has(id)) {
      byDeptId.set(id, { id, name, memberIds: [] })
    }
    byDeptId.get(id)!.memberIds.push(m.id)
  }
  const children: OrgDepartmentNode[] = Array.from(byDeptId.values())
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    .map(d => ({
      id: d.id,
      name: d.name,
      memberIds: d.memberIds,
    }))
  return [{ id: 'dep-root-org', name: '组织', children }]
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T } | null
  if (!res.ok || !json?.ok) return { ok: false }
  return { ok: true, data: json.data as T }
}

/** 任意已登录用户可调用的企业成员列表（非管理员权限） */
export async function fetchDirectoryUsers(): Promise<DirectoryUserDTO[] | null> {
  const url = resolveBackendUrl('/api/users')
  if (!url) return null
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  const p = await parseJson<DirectoryUserDTO[]>(res)
  return p.ok ? p.data : null
}
