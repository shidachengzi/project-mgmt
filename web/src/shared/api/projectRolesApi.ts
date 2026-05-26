import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type ProjectRoleWithPermsDTO = {
  id: string
  key: string
  name: string
  note?: string | null
  isDefault: boolean
  permissionKeys: string[]
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function putProjectRolePermissions(
  projectId: string,
  roleId: string,
  permissionKeys: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(
    `/api/projects/${encodeURIComponent(projectId)}/roles/${encodeURIComponent(roleId)}/permissions`,
  )
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissionKeys }),
  })
  const p = await parseJson<unknown>(res)
  if (!p.ok) return p
  return { ok: true }
}

export async function postProjectRole(
  projectId: string,
  body: { key?: string; name: string; note?: string | null },
): Promise<{ ok: true; data: ProjectRoleWithPermsDTO } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/projects/${encodeURIComponent(projectId)}/roles`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<ProjectRoleWithPermsDTO>(res)
}

export async function patchProjectDefaultRole(
  projectId: string,
  roleId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(
    `/api/projects/${encodeURIComponent(projectId)}/roles/${encodeURIComponent(roleId)}`,
  )
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PATCH',
    credentials: 'include',
  })
  const p = await parseJson<unknown>(res)
  if (!p.ok) return p
  return { ok: true }
}

export async function deleteProjectRole(
  projectId: string,
  roleId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(
    `/api/projects/${encodeURIComponent(projectId)}/roles/${encodeURIComponent(roleId)}`,
  )
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'DELETE',
    credentials: 'include',
  })
  const p = await parseJson<unknown>(res)
  if (!p.ok) return p
  return { ok: true }
}
