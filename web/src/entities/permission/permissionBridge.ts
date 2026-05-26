import { resolveBackendUrl } from '../../shared/api/backendClient'
import { sessionAwareFetch } from '../../shared/api/sessionAwareFetch'

export type SystemPermissionSnapshot = {
  userId: string
  roleKeys: string[]
  permissionKeys: string[]
}

export type ProjectPermissionSnapshot = {
  projectId: string
  userId: string
  roleKeys: string[]
  permissionKeys: string[]
}

async function fetchPermissionSnapshot<T>(path: string): Promise<T | null> {
  const url = resolveBackendUrl(path)
  if (!url) return null
  try {
    const res = await sessionAwareFetch(url, { credentials: 'include' })
    if (!res.ok) return null
    const payload = (await res.json()) as { ok?: boolean; data?: T }
    if (!payload?.ok || !payload.data) return null
    return payload.data
  } catch {
    return null
  }
}

export const fetchSystemPermissionSnapshot = () => fetchPermissionSnapshot<SystemPermissionSnapshot>('/api/system/permissions/me')

export const fetchProjectPermissionSnapshot = (projectId: string) =>
  fetchPermissionSnapshot<ProjectPermissionSnapshot>(`/api/projects/${encodeURIComponent(projectId)}/permissions/me`)

