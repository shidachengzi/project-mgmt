import type { OrgDepartmentNode, OrgMember } from '../../entities/org/model/types'
import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type AdminDeptDTO = {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  children: AdminDeptDTO[]
}

export type AdminMemberDTO = {
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

const avatarPalette = ['#f58aa8', '#7fd1ae', '#69b1ff', '#ffd666', '#b37feb', '#5c8df6', '#95de64']

const SYSTEM_ROLE_PRIORITY = ['owner', 'admin', 'member'] as const

function pickPrimarySystemRoleKey(keys: string[]): string {
  for (const k of SYSTEM_ROLE_PRIORITY) {
    if (keys.includes(k)) return k
  }
  return keys[0] ?? 'member'
}

const SYSTEM_ROLE_LABEL: Record<string, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '普通成员',
}

/** 成员管理 / 角色分配下拉（后端系统角色 key） */
export const BACKEND_SYSTEM_ROLE_OPTIONS: { value: 'owner' | 'admin' | 'member'; label: string }[] = [
  { value: 'owner', label: '所有者' },
  { value: 'admin', label: '管理员' },
  { value: 'member', label: '普通成员' },
]

function hashPick(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  return avatarPalette[Math.abs(h) % avatarPalette.length]
}

export function adminMemberDtoToOrg(m: AdminMemberDTO): OrgMember {
  const department = m.departmentName?.trim() || '未分配部门'
  const keys = m.systemRoleKeys ?? []
  const systemRoleKey = pickPrimarySystemRoleKey(keys)
  return {
    id: m.id,
    name: m.name,
    username: m.username,
    code: m.username ?? '',
    phone: m.mobile ?? '',
    email: m.email ?? '',
    departmentId: m.departmentId,
    department,
    title: m.jobTitle ?? '',
    systemRoleKey,
    role: SYSTEM_ROLE_LABEL[systemRoleKey] ?? systemRoleKey,
    letter: m.name.slice(0, 1).toUpperCase(),
    avatarText: m.name.slice(0, 2).toUpperCase(),
    avatarColor: hashPick(m.id),
    disabled: m.status === 'disabled',
  }
}

export function mapAdminDeptTreeToOrg(root: AdminDeptDTO, members: OrgMember[]): OrgDepartmentNode {
  const walk = (d: AdminDeptDTO): OrgDepartmentNode => {
    const memberIds =
      d.id === 'dep-root-org' ? undefined : members.filter(x => x.departmentId === d.id).map(x => x.id)
    return {
      id: d.id,
      name: d.name,
      memberIds,
      children: d.children?.length ? d.children.map(walk) : undefined,
    }
  }
  return walk(root)
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function fetchAdminDepartmentTree(): Promise<{ ok: true; data: AdminDeptDTO } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/admin/departments')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<AdminDeptDTO>(res)
}

export async function fetchAdminMembers(q?: string): Promise<{ ok: true; data: AdminMemberDTO[] } | { ok: false; message: string }> {
  const base = resolveBackendUrl('/api/admin/members')
  if (!base) return { ok: false, message: '未配置后端地址' }
  const url = q ? `${base}?q=${encodeURIComponent(q)}` : base
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<AdminMemberDTO[]>(res)
}

export async function postAdminDepartment(body: { parentId: string | null; name: string }): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/admin/departments')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const p = await parseJson<{ id: string }>(res)
  if (!p.ok) return p
  return { ok: true, id: p.data.id }
}

export async function patchAdminDepartment(id: string, body: { name: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/admin/departments/${encodeURIComponent(id)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const p = await parseJson<{ ok: boolean }>(res)
  if (!p.ok) return p
  return { ok: true }
}

export async function deleteAdminDepartment(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/admin/departments/${encodeURIComponent(id)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { method: 'DELETE', credentials: 'include' })
  const p = await parseJson<{ ok: boolean }>(res)
  if (!p.ok) return p
  return { ok: true }
}

export async function putAdminDepartmentReorder(body: { parentId: string | null; orderedIds: string[] }): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/admin/departments/reorder')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const p = await parseJson<{ ok: boolean }>(res)
  if (!p.ok) return p
  return { ok: true }
}

export async function postAdminMember(body: {
  name: string
  username: string
  password: string
  email?: string | null
  mobile?: string | null
  employeeCode?: string | null
  jobTitle?: string | null
  departmentId?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/admin/members')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const p = await parseJson<{ id: string }>(res)
  if (!p.ok) return p
  return { ok: true, id: p.data.id }
}

export async function patchAdminMember(
  userId: string,
  body: {
    name?: string
    username?: string
    employeeCode?: string | null
    email?: string | null
    mobile?: string | null
    jobTitle?: string | null
    departmentId?: string | null
    status?: 'active' | 'disabled'
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/admin/members/${encodeURIComponent(userId)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const p = await parseJson<{ ok: boolean }>(res)
  if (!p.ok) return p
  return { ok: true }
}

export async function putAdminUserSystemRole(
  userId: string,
  roleKey: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/admin/users/${encodeURIComponent(userId)}/system-roles`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleKey }),
  })
  const p = await parseJson<{ ok: boolean }>(res)
  if (!p.ok) return p
  return { ok: true }
}

export type AdminJobTitleDTO = {
  id: string
  name: string
  sortOrder: number
}

export async function fetchAdminJobTitles(): Promise<
  { ok: true; data: AdminJobTitleDTO[] } | { ok: false; message: string }
> {
  const url = resolveBackendUrl('/api/admin/job-titles')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<AdminJobTitleDTO[]>(res)
}

export async function postAdminJobTitle(name: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/admin/job-titles')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const p = await parseJson<{ id: string }>(res)
  if (!p.ok) return p
  return { ok: true, id: p.data.id }
}

export async function patchAdminJobTitle(
  id: string,
  name: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/admin/job-titles/${encodeURIComponent(id)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const p = await parseJson<{ ok: boolean }>(res)
  if (!p.ok) return p
  return { ok: true }
}

export async function deleteAdminJobTitle(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/admin/job-titles/${encodeURIComponent(id)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { method: 'DELETE', credentials: 'include' })
  const p = await parseJson<{ ok: boolean }>(res)
  if (!p.ok) return p
  return { ok: true }
}

export async function putAdminJobTitlesReorder(
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/admin/job-titles/reorder')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds }),
  })
  const p = await parseJson<{ ok: boolean }>(res)
  if (!p.ok) return p
  return { ok: true }
}
