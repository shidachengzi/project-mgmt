import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { tryRefreshSession } from './authSessionRefresh'
import { isBackendAuthEnabled } from './backendClient'

/** 登录 / 找回密码等接口的 401 不应按「会话过期」清前端态 */
function isAuthPublicUnauthenticatedRequest(url: string) {
  return url.includes('/api/auth/login') || url.includes('/api/auth/password-reset')
}

function shouldAttemptRefresh(url: string) {
  return !isAuthPublicUnauthenticatedRequest(url) && !url.includes('/api/auth/refresh')
}

/**
 * 带 Cookie 的请求；access 过期时先 POST /api/auth/refresh 续期并重试一次。
 * refresh 也失效（超过 7d 等）才清除前端态并跳转登录页。
 * 登录 POST 的 401 不触发，以免与「密码错误」混淆。
 */
export async function sessionAwareFetch(input: string, init?: RequestInit): Promise<Response> {
  const credentials = init?.credentials ?? 'include'
  const res = await fetch(input, { ...init, credentials })
  if (res.status !== 401 || !isBackendAuthEnabled()) return res
  if (!shouldAttemptRefresh(input)) return res

  const refreshed = await tryRefreshSession()
  if (refreshed) {
    return fetch(input, { ...init, credentials })
  }

  useAuthStore.getState().expireSession()
  return res
}
