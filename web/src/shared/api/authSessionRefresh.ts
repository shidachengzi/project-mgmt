import { isBackendAuthEnabled, resolveBackendUrl } from './backendClient'

let refreshInFlight: Promise<boolean> | null = null

/** 用 HttpOnly refresh Cookie 换取新的 access/refresh Cookie；并发 401 时共用一个请求 */
export async function tryRefreshSession(): Promise<boolean> {
  if (!isBackendAuthEnabled()) return false
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const url = resolveBackendUrl('/api/auth/refresh')
    if (!url) return false
    try {
      const res = await fetch(url, { method: 'POST', credentials: 'include' })
      return res.ok
    } catch {
      return false
    }
  })().finally(() => {
    refreshInFlight = null
  })

  return refreshInFlight
}
