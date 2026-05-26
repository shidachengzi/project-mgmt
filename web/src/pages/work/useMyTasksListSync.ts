import { useEffect, useRef, type MutableRefObject } from 'react'
import { message } from 'antd'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { shouldNotifyCollaborativeRemoteSync } from '../../shared/lib/collaborativeSyncNotify'
import { fetchMyTasks, type MyTaskItemDTO } from '../../shared/api/myTasksApi'

const POLL_MS = 12_000

export type MyTasksBuckets = {
  responsible: MyTaskItemDTO[]
  participated: MyTaskItemDTO[]
  created: MyTaskItemDTO[]
}

export function fingerprintMyTasksBuckets(buckets: MyTasksBuckets): string {
  const parts: string[] = []
  for (const scope of ['responsible', 'participated', 'created'] as const) {
    for (const item of buckets[scope]) {
      parts.push(`${scope}:${item.projectId}:${item.itemKey}:${item.updatedAt}:${item.status}`)
    }
  }
  return parts.sort().join('\n')
}

export type UseMyTasksListSyncParams = {
  enabled: boolean
  /** 内联新建、筛选弹层、拖拽看板时跳过，避免打断操作 */
  isDirty: () => boolean
  onRemoteChange: (buckets: MyTasksBuckets) => void | Promise<void>
  /** 首次加载成功后写入，供轮询对比 */
  lastFingerprintRef: MutableRefObject<string | null>
  notifyOnSync?: boolean
}

/**
 * 「我的任务」列表协作同步：轮询三栏 scope，指纹变化时合并远端数据。
 */
export function useMyTasksListSync({
  enabled,
  isDirty,
  onRemoteChange,
  lastFingerprintRef,
  notifyOnSync = true
}: UseMyTasksListSyncParams) {
  const syncingRef = useRef(false)

  useEffect(() => {
    if (!enabled || !isBackendAuthEnabled()) return

    let cancelled = false

    const poll = async () => {
      if (cancelled || document.hidden || isDirty() || syncingRef.current) return
      const [r, p, c] = await Promise.all([
        fetchMyTasks('responsible'),
        fetchMyTasks('participated'),
        fetchMyTasks('created')
      ])
      if (cancelled || !r.ok || !p.ok || !c.ok) return

      const buckets: MyTasksBuckets = {
        responsible: r.data,
        participated: p.data,
        created: c.data
      }
      const fp = fingerprintMyTasksBuckets(buckets)
      const known = lastFingerprintRef.current
      if (!known) {
        lastFingerprintRef.current = fp
        return
      }
      if (fp === known) return

      syncingRef.current = true
      try {
        await onRemoteChange(buckets)
        lastFingerprintRef.current = fp
        if (notifyOnSync && known && shouldNotifyCollaborativeRemoteSync()) {
          message.info('任务列表已由其他成员更新，已同步最新内容')
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
  }, [enabled, isDirty, onRemoteChange, lastFingerprintRef, notifyOnSync])
}
