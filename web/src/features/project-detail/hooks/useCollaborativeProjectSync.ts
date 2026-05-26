import { useEffect, useRef, type MutableRefObject } from 'react'
import { message } from 'antd'
import { isBackendAuthEnabled } from '../../../shared/api/backendClient'
import { shouldNotifyCollaborativeRemoteSync } from '../../../shared/lib/collaborativeSyncNotify'
import { fetchProjectDetail } from '../../../shared/api/projectsApi'

const POLL_MS = 12_000

export type UseCollaborativeProjectSyncParams = {
  projectId: string
  enabled: boolean
  /** 本地有未保存编辑或弹窗编辑中时跳过拉取，避免覆盖用户输入 */
  isDirty: () => boolean
  /** 检测到服务端 revision 变化后拉取并合并 */
  onRemoteChange: () => void | Promise<void>
  /** 父组件在初次加载 / 本地保存成功后更新已知 revision */
  serverUpdatedAtRef: MutableRefObject<string | null>
  /** 为 false 时不弹出「已同步」提示（如列表页静默刷新） */
  notifyOnSync?: boolean
}

/**
 * 多成员协作：轮询项目 `updatedAt`，在他人修改后触发 onRemoteChange 刷新本地状态。
 */
export function useCollaborativeProjectSync({
  projectId,
  enabled,
  isDirty,
  onRemoteChange,
  serverUpdatedAtRef,
  notifyOnSync = true
}: UseCollaborativeProjectSyncParams) {
  const syncingRef = useRef(false)

  useEffect(() => {
    if (!enabled || !isBackendAuthEnabled()) return

    let cancelled = false

    const poll = async () => {
      if (cancelled || document.hidden || isDirty() || syncingRef.current) return
      const res = await fetchProjectDetail(projectId)
      if (cancelled || !res.ok) return
      const serverAt = res.data.updatedAt
      const known = serverUpdatedAtRef.current
      if (!known) {
        serverUpdatedAtRef.current = serverAt
        return
      }
      if (serverAt <= known) return

      syncingRef.current = true
      try {
        await onRemoteChange()
        serverUpdatedAtRef.current = serverAt
        if (notifyOnSync && known && shouldNotifyCollaborativeRemoteSync()) {
          message.info('项目数据已由其他成员更新，已同步最新内容')
        }
      } finally {
        syncingRef.current = false
      }
    }

    const intervalId = window.setInterval(() => void poll(), POLL_MS)
    const onWake = () => void poll()
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    void poll()

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [projectId, enabled, isDirty, onRemoteChange, serverUpdatedAtRef, notifyOnSync])
}
