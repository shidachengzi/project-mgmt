import { resolveBackendUrl } from './backendClient'

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error?: { message?: string } }

async function postJson<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string; status: number }> {
  const url = resolveBackendUrl(path)
  if (!url) return { ok: false, message: '未配置后端地址', status: 0 }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  const raw = await res.text()
  let json: ApiEnvelope<T> | null = null
  try {
    json = raw ? (JSON.parse(raw) as ApiEnvelope<T>) : null
  } catch {
    json = null
  }
  if (!json || typeof json !== 'object' || !('ok' in json)) {
    return { ok: false, message: `请求失败 (${res.status})`, status: res.status }
  }
  if (!json.ok) {
    const msg = json.error?.message?.trim() || `请求失败 (${res.status})`
    return { ok: false, message: msg, status: res.status }
  }
  return { ok: true, data: json.data }
}

export async function requestPasswordResetEmail(email: string) {
  return postJson<{ ok: boolean; message?: string }>('/api/auth/password-reset/request', { email })
}

export async function verifyPasswordResetEmailCode(email: string, code: string) {
  return postJson<{ ok: boolean; resetToken: string }>('/api/auth/password-reset/verify', { email, code })
}

export async function finalizePasswordResetWithToken(resetToken: string, newPassword: string) {
  return postJson<{ ok: boolean; message?: string }>('/api/auth/password-reset/finalize', { resetToken, newPassword })
}
