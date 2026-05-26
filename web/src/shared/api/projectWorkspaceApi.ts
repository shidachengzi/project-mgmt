import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

/** 与后端 `ProjectWorkspaceDTO` 对齐的可 JSON 序列化结构 */
export type ProjectWorkspaceClientPayload = {
  overview?: Record<string, unknown>
  attachments?: unknown[]
  overviewActivities?: unknown[]
  activityByKey?: Record<string, unknown[]>
  commentsByKey?: Record<string, unknown[]>
  /** 任务 key → 参与人姓名 */
  taskParticipantsByKey?: Record<string, string[]>
  /** 任务/子任务 key → 附件列表 */
  taskAttachmentsByKey?: Record<string, unknown[]>
  targetRelatedTasksByKey?: Record<string, unknown[]>
  targetAttachmentsByKey?: Record<string, unknown[]>
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function fetchProjectWorkspace(
  projectId: string,
): Promise<{ ok: true; data: Required<ProjectWorkspaceClientPayload> } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/projects/${encodeURIComponent(projectId)}/workspace`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  try {
    const res = await sessionAwareFetch(url, { credentials: 'include' })
    const p = await parseJson<Required<ProjectWorkspaceClientPayload>>(res)
    if (!p.ok) return p
    return {
      ok: true,
      data: {
        overview: p.data.overview ?? {},
        attachments: p.data.attachments ?? [],
        overviewActivities: p.data.overviewActivities ?? [],
        activityByKey: p.data.activityByKey ?? {},
        commentsByKey: p.data.commentsByKey ?? {},
        taskParticipantsByKey: p.data.taskParticipantsByKey ?? {},
        taskAttachmentsByKey: p.data.taskAttachmentsByKey ?? {},
        targetRelatedTasksByKey: p.data.targetRelatedTasksByKey ?? {},
        targetAttachmentsByKey: p.data.targetAttachmentsByKey ?? {},
      },
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, message: '请求已取消' }
    }
    console.warn('[fetchProjectWorkspace]', err)
    return { ok: false, message: '网络异常，请稍后重试' }
  }
}

export async function patchProjectWorkspace(
  projectId: string,
  body: ProjectWorkspaceClientPayload,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = resolveBackendUrl(`/api/projects/${encodeURIComponent(projectId)}/workspace`)
  if (!url) return { ok: false, message: '未配置后端地址' }
  try {
    const res = await sessionAwareFetch(url, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null
    if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
    return { ok: true }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, message: '请求已取消' }
    }
    console.warn('[patchProjectWorkspace]', err)
    return { ok: false, message: '网络异常，请稍后重试' }
  }
}
