import { useEffect } from 'react'
import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { useBackendDataStore } from '../../entities/workspace/model/backendDataStore'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { initImSocketWhenAuthed, teardownImSocketForLogout } from '../../features/contacts-im/imSocketClient'

/** 应用级副作用：会话恢复、工作区 bootstrap、IM 连接、本地 schema 迁移 */
export function useAppBootstrap() {
  const authedUserId = useAuthStore(s => s.authedUserId)
  const hydrateSessionFromBackend = useAuthStore(s => s.hydrateSessionFromBackend)
  const bootstrapBackendData = useBackendDataStore(s => s.bootstrap)

  useEffect(() => {
    void hydrateSessionFromBackend()
  }, [hydrateSessionFromBackend])

  useEffect(() => {
    if (!authedUserId || !isBackendAuthEnabled()) return
    void bootstrapBackendData()
  }, [authedUserId, bootstrapBackendData])

  useEffect(() => {
    if (!authedUserId || !isBackendAuthEnabled()) {
      teardownImSocketForLogout()
      return
    }
    initImSocketWhenAuthed()
  }, [authedUserId])

  useEffect(() => {
    const SCHEMA_VERSION = 'pm-schema-2026-05-22-no-local-profile-secrets'
    try {
      const current = localStorage.getItem('pm-schema-version')
      if (current === SCHEMA_VERSION) return
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (key && key.startsWith('pm-')) localStorage.removeItem(key)
      }
      localStorage.setItem('pm-schema-version', SCHEMA_VERSION)
    } catch {
      // ignore localStorage failures
    }
  }, [])
}
