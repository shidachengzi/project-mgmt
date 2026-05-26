import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type ReportTaskSummaryItemDTO = {
  key: string
  kind: string
  title: string
  status: string
  owner: string | null
  end: string
}

export type ReportProjectTaskSummaryDTO = {
  projectId: string
  projectTitle: string
  projectStatus: string
  projectEndDate: string | null
  tasks: ReportTaskSummaryItemDTO[]
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function fetchReportsTaskSummary(): Promise<
  { ok: true; data: ReportProjectTaskSummaryDTO[] } | { ok: false; message: string }
> {
  const url = resolveBackendUrl('/api/reports/task-summary')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson<ReportProjectTaskSummaryDTO[]>(res)
}
