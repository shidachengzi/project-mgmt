import { useCallback, useEffect, useMemo, useState } from 'react'
import { flattenTaskManageRows } from '../tasks/taskManageListUtils'
import type { TaskEditorTab } from '../tasks/taskTypes'
import type { TargetEditingField } from '../targets/useProjectTargetCrud'
import type { TargetRecord, TargetSideTab } from '../targets/targetTypes'
import type { TaskManageRecord } from '../tasks/taskTypes'

export type ProjectDetailFromExternal = { kind: 'target' | 'task'; key: string }

export type UseProjectDetailEditorsParams = {
  projectId: string
  detailFromExternal?: ProjectDetailFromExternal | null
  isTargetHydrated: boolean
  isTaskManageHydrated: boolean
  targetList: TargetRecord[]
  taskManageList: TaskManageRecord[]
  editingTarget: TargetRecord | null
  setEditingTarget: (t: TargetRecord | null) => void
  setEditingTargetField: (f: TargetEditingField | null) => void
  editingTask: TaskManageRecord | null
  setEditingTask: (t: TaskManageRecord | null) => void
  editingChildTask: TaskManageRecord | null
  setEditingChildTask: (t: TaskManageRecord | null) => void
  setTaskEditorTab: (tab: TaskEditorTab) => void
  setTargetSideTab: (tab: TargetSideTab) => void
  setTargetCommentInput: (v: string) => void
}

export function useProjectDetailEditors({
  projectId,
  detailFromExternal,
  isTargetHydrated,
  isTaskManageHydrated,
  targetList,
  taskManageList,
  editingTarget: _editingTarget,
  setEditingTarget,
  setEditingTargetField,
  editingTask,
  setEditingTask,
  setEditingChildTask,
  setTaskEditorTab,
  setTargetSideTab,
  setTargetCommentInput
}: UseProjectDetailEditorsParams) {
  const [recentTaskKeys, setRecentTaskKeys] = useState<string[]>([])

  const manageFlatTasks = useMemo(() => flattenTaskManageRows(taskManageList).filter(r => r.kind === 'task' || r.kind === 'subtask'), [taskManageList])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`pm-task-recent-${projectId}`)
      setRecentTaskKeys(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      setRecentTaskKeys([])
    }
  }, [projectId])

  useEffect(() => {
    if (!editingTask?.key) return
    setRecentTaskKeys(prev => {
      const next = [editingTask.key, ...prev.filter(k => k !== editingTask.key)].slice(0, 8)
      try {
        localStorage.setItem(`pm-task-recent-${projectId}`, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [editingTask?.key, projectId])

  useEffect(() => {
    if (!detailFromExternal) return
    if (detailFromExternal.kind === 'target') {
      setEditingTask(null)
      setEditingChildTask(null)
      if (!isTargetHydrated) return
      const next = targetList.find(x => x.key === detailFromExternal.key)
      if (next) {
        setEditingTarget(next)
        setEditingTargetField(null)
        setTargetSideTab('评论')
        setTargetCommentInput('')
      } else {
        setEditingTarget(null)
        setEditingTargetField(null)
      }
      return
    }
    setEditingTarget(null)
    setEditingTargetField(null)
    if (!isTaskManageHydrated) return
    const task = manageFlatTasks.find(x => x.key === detailFromExternal.key)
    if (task) {
      setEditingTask(task)
      setEditingChildTask(null)
      setTaskEditorTab('任务信息')
      setTargetSideTab('评论')
    } else {
      setEditingTask(null)
      setEditingChildTask(null)
    }
  }, [
    detailFromExternal,
    isTargetHydrated,
    isTaskManageHydrated,
    targetList,
    manageFlatTasks,
    setEditingTarget,
    setEditingTargetField,
    setEditingTask,
    setEditingChildTask,
    setTaskEditorTab,
    setTargetSideTab,
    setTargetCommentInput
  ])

  const getParentTaskBadge = useCallback(
    (taskKey?: string) => {
      if (!taskKey) return undefined
      const walk = (rows: TaskManageRecord[]): string | undefined => {
        for (const row of rows) {
          const children = row.children ?? []
          if (row.kind === 'task' && children.some(c => c.key === taskKey)) {
            return `父任务: ${row.seq ?? '—'} ${row.title}`
          }
          const nested = walk(children)
          if (nested) return nested
        }
        return undefined
      }
      return walk(taskManageList)
    },
    [taskManageList]
  )

  const openRelatedTaskDetailByKey = useCallback(
    (taskKey: string) => {
      const t = manageFlatTasks.find(x => x.key === taskKey)
      if (!t) return
      setEditingTask(t)
      setTaskEditorTab('任务信息')
      setTargetSideTab('评论')
    },
    [manageFlatTasks, setEditingTask, setTaskEditorTab, setTargetSideTab]
  )

  const openTaskDetailByKey = useCallback(
    (taskKey: string) => {
      const t = manageFlatTasks.find(x => x.key === taskKey)
      if (!t) return
      if (editingTask && editingTask.key !== taskKey) {
        setEditingChildTask(t)
      } else {
        setEditingTask(t)
        setEditingChildTask(null)
      }
      setTaskEditorTab('任务信息')
      setTargetSideTab('评论')
    },
    [editingTask, manageFlatTasks, setEditingChildTask, setEditingTask, setTaskEditorTab, setTargetSideTab]
  )

  const openGanttTaskDetail = useCallback(
    (taskKey: string) => {
      const t = manageFlatTasks.find(x => x.key === taskKey)
      if (!t) return
      setEditingTask(t)
      setEditingChildTask(null)
      setTaskEditorTab('任务信息')
      setTargetSideTab('评论')
    },
    [manageFlatTasks, setEditingChildTask, setEditingTask, setTaskEditorTab, setTargetSideTab]
  )

  return {
    recentTaskKeys,
    manageFlatTasks,
    getParentTaskBadge,
    openRelatedTaskDetailByKey,
    openTaskDetailByKey,
    openGanttTaskDetail
  }
}
