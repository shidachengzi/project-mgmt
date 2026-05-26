import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type ProjectTaskTreeDTO = {
  key: string
  id: string
  kind: string
  title: string
  status: string
  priority: string
  start: string
  end: string
  ownerUserId: string | null
  ownerName: string | null
  stage: string | null
  description: string
  progress: number
  attachments: number
  sortOrder: number
  createdAt?: string
  updatedAt?: string
  children?: ProjectTaskTreeDTO[]
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function fetchProjectTasks(
  projectId: string,
): Promise<{ ok: true; data: ProjectTaskTreeDTO[] } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/projects/${encodeURIComponent(projectId)}/tasks`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<ProjectTaskTreeDTO[]>(res)
}

export async function postProjectTask(
  projectId: string,
  body: {
    title: string
    kind?: 'stage' | 'task' | 'subtask' | 'target'
    parentId?: string | null
    status?: string
    priority?: string
    startDate?: string | null
    endDate?: string | null
    ownerUserId?: string | null
    stageTitle?: string | null
    description?: string | null
    progress?: number
    attachments?: number
    sortOrder?: number
  },
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/projects/${encodeURIComponent(projectId)}/tasks`)
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

export async function patchProjectTask(
  projectId: string,
  taskId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(
    `/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`,
  )
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

export async function deleteProjectTask(
  projectId: string,
  taskId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(
    `/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`,
  )
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { method: 'DELETE', credentials: 'include' })
  const p = await parseJson<{ ok: boolean }>(res)
  if (!p.ok) return p
  return { ok: true }
}
