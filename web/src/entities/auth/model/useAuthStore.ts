import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '../../../shared/constants/storageKeys'
import { useAccountStore } from '../../account/model/useAccountStore'
import { tryRefreshSession } from '../../../shared/api/authSessionRefresh'
import { isBackendAuthEnabled, resolveBackendUrl } from '../../../shared/api/backendClient'
import { useBackendDataStore } from '../../workspace/model/backendDataStore'

type AuthState = {
  authedUserId: string | null
  /** 后端账号：支持用户名、邮箱、手机号（与 POST /api/auth/login 一致；不含姓名 name） */
  loginWithBackend: (account: string, password: string) => Promise<{ ok: true; userId: string } | { ok: false; reason: string }>
  /** 有 HttpOnly Cookie 时恢复登录态 */
  hydrateSessionFromBackend: () => Promise<void>
  /** Cookie 失效或接口 401：清空本地登录态与工作区缓存，并跳转登录页（已在登录页则仅清空） */
  expireSession: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      authedUserId: null,
      loginWithBackend: async (account, password) => {
        const url = resolveBackendUrl('/api/auth/login')
        if (!url) return { ok: false, reason: '未配置后端地址' }
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ account: String(account ?? '').trim(), password: String(password ?? '') })
          })
          const raw = await res.text()
          type BackendLoginJson = {
            ok?: boolean
            data?: {
              user?: { id: string; name: string; username?: string | null; email?: string | null; mobile?: string | null; employeeCode?: string | null }
            }
            error?: { message?: string }
          }
          let json: BackendLoginJson | null = null
          try {
            json = raw ? (JSON.parse(raw) as BackendLoginJson) : null
          } catch {
            json = null
          }
          if (!res.ok || !json?.ok || !json.data?.user?.id) {
            const fromApi = json?.error?.message?.trim()
            const reason = fromApi || (res.status === 401 ? '账号或密码错误' : res.status >= 500 ? `服务器错误 (${res.status})` : `登录失败 (${res.status})`)
            return { ok: false, reason }
          }
          const u = json.data.user
          set({ authedUserId: u.id })
          useAccountStore.getState().patchProfile({
            name: u.name,
            code: u.username ?? u.employeeCode ?? '',
            email: u.email || '',
            phone: u.mobile || ''
          })
          return { ok: true, userId: u.id }
        } catch {
          return { ok: false, reason: '无法连接后端，请确认已启动 Next 服务且代理正确' }
        }
      },
      expireSession: () => {
        useBackendDataStore.getState().clear()
        useAccountStore.getState().reset()
        const wasAuthed = get().authedUserId != null
        set({ authedUserId: null })
        if (typeof window === 'undefined' || !wasAuthed) return
        const path = window.location.hash.replace(/^#/, '') || '/'
        if (!path.startsWith('/login')) {
          window.location.hash = '#/login'
        }
      },
      hydrateSessionFromBackend: async () => {
        if (!isBackendAuthEnabled()) return
        const url = resolveBackendUrl('/api/auth/me')
        if (!url) return
        try {
          let res = await fetch(url, { credentials: 'include' })
          if (res.status === 401) {
            const refreshed = await tryRefreshSession()
            if (!refreshed) {
              get().expireSession()
              return
            }
            res = await fetch(url, { credentials: 'include' })
            if (res.status === 401) {
              get().expireSession()
              return
            }
          }
          if (!res.ok) return
          const json = (await res.json().catch(() => null)) as {
            ok?: boolean
            data?: { id: string; name: string; username?: string | null; email?: string | null; mobile?: string | null; employeeCode?: string | null }
          } | null
          if (!json?.ok || !json.data?.id) return
          const u = json.data
          set({ authedUserId: u.id })
          useAccountStore.getState().patchProfile({
            name: u.name,
            code: u.username ?? u.employeeCode ?? '',
            email: u.email || '',
            phone: u.mobile || ''
          })
        } catch {
          // ignore
        }
      },
      logout: () => {
        const url = resolveBackendUrl('/api/auth/logout')
        if (url) {
          void fetch(url, { method: 'POST', credentials: 'include' }).catch(() => {})
        }
        useBackendDataStore.getState().clear()
        useAccountStore.getState().reset()
        if (get().authedUserId) set({ authedUserId: null })
      }
    }),
    {
      name: STORAGE_KEYS.authUserId,
      partialize: s => ({ authedUserId: s.authedUserId }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<AuthState>) })
    }
  )
)
