import { resolveBackendUrl } from './backendClient'
import { sessionAwareFetch } from './sessionAwareFetch'

export type AdminMailFormInitialDTO = {
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  /** 未返回时视为 false（兼容旧后端） */
  smtpTlsSkipVerify?: boolean
  smtpFrom: string
  smtpUser: string
  hasSavedPassword: boolean
}

export type AdminSystemConfigDTO = {
  service: {
    nodeEnv: string
    deadlineReminderLeadMinutes: number
    deadlineReminderIntervalMs: number
    deadlineReminderInIm: boolean
    deadlineReminderInNext: boolean
    internalCronSecretSet: boolean
  }
  mail: {
    configured: boolean
    /** 当前实际生效来源 */
    source: 'database' | 'environment' | 'none'
    host: string | null
    port: number
    secure: boolean
    /** 未返回时视为 false（兼容旧后端） */
    tlsSkipVerify?: boolean
    from: string | null
    authUserSet: boolean
    authPassSet: boolean
    /** 表单初始值（保存后写入数据库） */
    formInitial: AdminMailFormInitialDTO
  }
}

export type PatchAdminMailBody = {
  smtpHost: string | null
  smtpPort: number
  smtpSecure: boolean
  smtpTlsSkipVerify: boolean
  smtpFrom: string | null
  smtpUser: string | null
  authPass?: string
  clearAuthPass?: boolean
}

async function parseJson<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.ok) return { ok: false, message: json?.error?.message || `请求失败 (${res.status})` }
  return { ok: true, data: json.data as T }
}

export async function fetchAdminSystemConfig(): Promise<{ ok: true; data: AdminSystemConfigDTO } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/admin/system-config')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, { credentials: 'include' })
  return parseJson(res)
}

export async function patchAdminMailConfig(
  body: PatchAdminMailBody,
): Promise<{ ok: true; data: { ok: boolean } } | { ok: false; message: string }> {
  const base = resolveBackendUrl('/api/admin/system-config/mail')
  if (!base) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(base, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function postAdminTestMail(
  to: string,
): Promise<{ ok: true; data: { ok: boolean } } | { ok: false; message: string }> {
  const url = resolveBackendUrl('/api/admin/system-config/test-mail')
  if (!url) return { ok: false, message: '未配置后端地址' }
  const res = await sessionAwareFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  })
  return parseJson(res)
}
