import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type AdminSystemRoleGroup = { key: string; name: string }

export type AdminSystemRolesSnapshot = {
  groups?: AdminSystemRoleGroup[]
  roles: { key: string; name: string; note?: string; groupKey?: string; isDefault?: boolean }[]
  membersByRole: Record<string, string[]>
  permissionsByRole: Record<string, string[]>
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function fetchAdminSystemRolesSnapshot(): Promise<
  { ok: true; data: AdminSystemRolesSnapshot } | { ok: false; message: string }
> {
  const url = resolveBackendUrl('/api/admin/system-roles')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<AdminSystemRolesSnapshot>(res)
}

export async function postAdminSystemRoleGroup(body: {
  name: string
  key?: string | null
}): Promise<{ ok: true; data: AdminSystemRoleGroup } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/admin/system-role-groups')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const p = await parseJson<AdminSystemRoleGroup>(res)
  if (!p.ok) return p
  return { ok: true, data: p.data }
}

export async function postAdminSystemRole(body: {
  name: string
  groupKey: string
  note?: string | null
  key?: string | null
}): Promise<{ ok: true; data: { key: string } } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/admin/system-roles')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const p = await parseJson<{ key: string }>(res)
  if (!p.ok) return p
  return { ok: true, data: p.data }
}

export async function putAdminRolePermissions(
  roleKey: string,
  permissionKeys: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/admin/system-roles/${encodeURIComponent(roleKey)}/permissions`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissionKeys }),
  })
  const p = await parseJson<{ ok: boolean }>(res)
  if (!p.ok) return p
  return { ok: true }
}
