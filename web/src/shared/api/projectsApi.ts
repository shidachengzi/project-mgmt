import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type ProjectDetailDTO = {
  id: string
  title: string
  visibility: string
  ownerUserId: string | null
  ownerName: string | null
  archived: boolean
  progressStatus: '未开始' | '进行中' | '验收中' | '已完成' | '关闭'
  coverKind: 'gradient' | 'image'
  coverImageData: string | null
  createdAt: string
  updatedAt: string
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function fetchProjectDetail(
  projectId: string,
): Promise<{ ok: true; data: ProjectDetailDTO } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/projects/${encodeURIComponent(projectId)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<ProjectDetailDTO>(res)
}

export async function patchProject(
  projectId: string,
  body: {
    title?: string
    visibility?: 'public' | 'private'
    ownerUserId?: string | null
    coverKind?: 'gradient' | 'image'
    coverImageData?: string | null
    archived?: boolean
  },
): Promise<{ ok: true; data: ProjectDetailDTO } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/projects/${encodeURIComponent(projectId)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<ProjectDetailDTO>(res)
}

export async function deleteProject(
  projectId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/projects/${encodeURIComponent(projectId)}`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { method: 'DELETE', credentials: 'include' })
  const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true }
}
