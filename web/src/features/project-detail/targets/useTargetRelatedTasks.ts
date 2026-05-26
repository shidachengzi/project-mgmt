import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { TargetRelatedTaskLink, WorkspaceActivityRecord } from '../hooks/useProjectDetailWorkspace'
import type { TaskManageRecord } from '../tasks/taskTypes'
import type { TargetRecord } from './targetTypes'

/** 目标关联任务关系统一为「依赖」 */
export const DEFAULT_TARGET_RELATED_TASK_RELATION = '依赖' as const

export type TargetTaskRelation = typeof DEFAULT_TARGET_RELATED_TASK_RELATION

export type UseTargetRelatedTasksParams = {
  editingTarget: TargetRecord | null
  targetRelatedTasksByKey: Record<string, TargetRelatedTaskLink[]>
  setTargetRelatedTasksByKey: Dispatch<SetStateAction<Record<string, TargetRelatedTaskLink[]>>>
  manageFlatTasks: TaskManageRecord[]
  recentTaskKeys: string[]
  hideCompletedRelated: boolean
  ensureMappedProjectPermission: (section: string, key: string) => boolean
  prependTargetActivity: (targetKey: string, entry: Omit<WorkspaceActivityRecord, 'id' | 'actor' | 'targetTitle' | 'createdAt'> & { targetTitle?: string }) => void
}

function taskPickerLabel(t: TaskManageRecord | undefined, taskKey: string) {
  return t ? `${t.seq != null ? t.seq : '—'} ${t.title}` : taskKey
}

export function useTargetRelatedTasks({ editingTarget, targetRelatedTasksByKey, setTargetRelatedTasksByKey, manageFlatTasks, recentTaskKeys, hideCompletedRelated, ensureMappedProjectPermission, prependTargetActivity }: UseTargetRelatedTasksParams) {
  const [relatedPickerOpen, setRelatedPickerOpen] = useState(false)
  const [relatedPickerSearch, setRelatedPickerSearch] = useState('')
  const [relatedPickerPendingKeys, setRelatedPickerPendingKeys] = useState<string[]>([])

  useEffect(() => {
    setRelatedPickerOpen(false)
    setRelatedPickerSearch('')
    setRelatedPickerPendingKeys([])
  }, [editingTarget?.key])

  const toggleRelatedPickerPending = useCallback((taskKey: string) => {
    setRelatedPickerPendingKeys(prev => (prev.includes(taskKey) ? prev.filter(k => k !== taskKey) : [...prev, taskKey]))
  }, [])

  const confirmRelatedPicker = useCallback(() => {
    if (!ensureMappedProjectPermission('目标管理', '任务关联')) return
    if (!editingTarget || relatedPickerPendingKeys.length === 0) {
      setRelatedPickerOpen(false)
      return
    }
    const targetKey = editingTarget.key
    const current = targetRelatedTasksByKey[targetKey] ?? []
    const existingKeys = new Set(current.map(l => l.taskKey))
    const byKey = new Map(current.map(l => [l.taskKey, l]))
    for (const taskKey of relatedPickerPendingKeys) {
      byKey.set(taskKey, { taskKey, relation: DEFAULT_TARGET_RELATED_TASK_RELATION })
    }
    setTargetRelatedTasksByKey(prev => ({
      ...prev,
      [targetKey]: Array.from(byKey.values())
    }))
    for (const taskKey of relatedPickerPendingKeys) {
      if (existingKeys.has(taskKey)) continue
      const t = manageFlatTasks.find(x => x.key === taskKey)
      prependTargetActivity(targetKey, {
        fieldLabel: '关联任务',
        before: '无',
        after: `关联任务「${taskPickerLabel(t, taskKey)}」`,
        targetTitle: editingTarget.title
      })
    }
    setRelatedPickerOpen(false)
    setRelatedPickerPendingKeys([])
    setRelatedPickerSearch('')
  }, [editingTarget, ensureMappedProjectPermission, manageFlatTasks, prependTargetActivity, relatedPickerPendingKeys, setTargetRelatedTasksByKey, targetRelatedTasksByKey])

  const cancelRelatedPicker = useCallback(() => {
    setRelatedPickerOpen(false)
    setRelatedPickerPendingKeys([])
    setRelatedPickerSearch('')
  }, [])

  const removeRelatedTaskLink = useCallback(
    (targetKey: string, taskKey: string) => {
      if (!ensureMappedProjectPermission('目标管理', '任务关联')) return
      const link = (targetRelatedTasksByKey[targetKey] ?? []).find(l => l.taskKey === taskKey)
      const t = manageFlatTasks.find(x => x.key === taskKey)
      if (link) {
        prependTargetActivity(targetKey, {
          fieldLabel: '关联任务',
          before: `已关联「${taskPickerLabel(t, taskKey)}」(依赖)`,
          after: '已移除',
          targetTitle: editingTarget?.key === targetKey ? editingTarget.title : undefined
        })
      }
      setTargetRelatedTasksByKey(prev => ({
        ...prev,
        [targetKey]: (prev[targetKey] ?? []).filter(l => l.taskKey !== taskKey)
      }))
    },
    [editingTarget, ensureMappedProjectPermission, manageFlatTasks, prependTargetActivity, setTargetRelatedTasksByKey, targetRelatedTasksByKey]
  )

  const relatedLinksForTarget = useMemo(() => (editingTarget?.key ? (targetRelatedTasksByKey[editingTarget.key] ?? []) : []), [editingTarget?.key, targetRelatedTasksByKey])

  const displayedRelatedLinks = useMemo(() => {
    if (!hideCompletedRelated) return relatedLinksForTarget
    return relatedLinksForTarget.filter(l => {
      const t = manageFlatTasks.find(x => x.key === l.taskKey)
      return t && t.status !== '已完成'
    })
  }, [relatedLinksForTarget, hideCompletedRelated, manageFlatTasks])

  const relatedTasksOverallPercent = useMemo(() => {
    if (!relatedLinksForTarget.length) return 0
    let done = 0
    for (const l of relatedLinksForTarget) {
      const t = manageFlatTasks.find(x => x.key === l.taskKey)
      if (t && (t.status === '已完成' || t.status === '关闭')) done += 1
    }
    return Math.round((done / relatedLinksForTarget.length) * 100)
  }, [relatedLinksForTarget, manageFlatTasks])

  const pickerBaseList = useMemo(() => {
    const linked = new Set(relatedLinksForTarget.map(l => l.taskKey))
    return manageFlatTasks.filter(t => !linked.has(t.key))
  }, [manageFlatTasks, relatedLinksForTarget])

  const pickerFiltered = useMemo(() => {
    const list = hideCompletedRelated ? pickerBaseList.filter(t => t.status !== '已完成') : [...pickerBaseList]
    const q = relatedPickerSearch.trim()
    if (!q) return list
    if (q.startsWith('#')) {
      const raw = q.slice(1).trim()
      const num = Number(raw)
      if (!Number.isNaN(num)) return list.filter(t => t.seq === num)
      return []
    }
    const n = q.toLowerCase()
    return list.filter(t => t.title.toLowerCase().includes(n) || (t.seq != null && String(t.seq).includes(n)))
  }, [pickerBaseList, relatedPickerSearch, hideCompletedRelated])

  const pickerRecentTasks = useMemo(() => {
    const keySet = new Set(pickerFiltered.map(t => t.key))
    return recentTaskKeys.map(k => manageFlatTasks.find(t => t.key === k)).filter((t): t is TaskManageRecord => t != null && keySet.has(t.key))
  }, [recentTaskKeys, pickerFiltered, manageFlatTasks])

  const pickerRestTasks = useMemo(() => {
    const rs = new Set(pickerRecentTasks.map(t => t.key))
    return pickerFiltered.filter(t => !rs.has(t.key))
  }, [pickerFiltered, pickerRecentTasks])

  return {
    relatedPickerOpen,
    setRelatedPickerOpen,
    relatedPickerSearch,
    setRelatedPickerSearch,
    relatedPickerPendingKeys,
    setRelatedPickerPendingKeys,
    toggleRelatedPickerPending,
    confirmRelatedPicker,
    cancelRelatedPicker,
    removeRelatedTaskLink,
    relatedLinksForTarget,
    displayedRelatedLinks,
    relatedTasksOverallPercent,
    pickerFiltered,
    pickerRecentTasks,
    pickerRestTasks
  }
}
