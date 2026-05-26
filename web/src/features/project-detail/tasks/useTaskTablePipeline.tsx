import { DatePicker, Input, Select } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { PriorityWithMarks, TASK_PRIORITY_LEVELS, type TaskPriorityLevel } from '../../../shared/ui/priorityWithMarks'
import type { WorkspaceActivityRecord } from '../hooks/useProjectDetailWorkspace'
import type { ProjectMemberRecord } from '../settings/projectMemberRole'
import { TARGET_TABLE_FILTER_OWNER_UNASSIGNED } from '../targets/targetTableFilters'
import { getTaskFilterCompletedAtIsoFromActivities } from '../targets/targetActivityCompletedAt'
import { computeStageTasksProgressPercent } from './projectTaskAdapter'
import {
  applyTaskManageTableFilterConditions,
  newTaskManageTableFilterId,
  TASK_MANAGE_STATUS_FILTER_OPTIONS,
  taskManageTableFilterRowHasValue,
} from './taskTableFilters'
import type { TaskGroupMode, TaskManageTableFilterCondition, TaskTableSortKey } from './taskToolbarConfig'
import { regroupTaskRows } from './taskTableGrouping'
import {
  filterTaskManageListByTitleSearch,
  flattenTaskManageRows,
  flattenTaskRowsForNoGroupView,
  isOverdueActiveTask
} from './taskManageListUtils'
import { sortTaskForest } from './taskTableSort'
import type { TaskFilter, TaskManageRecord } from './taskTypes'

export type UseTaskTablePipelineParams = {
  taskManageList: TaskManageRecord[]
  taskTypeLabel: string
  taskStageOptionTitles: string[]
  targetActivityByKey: Record<string, WorkspaceActivityRecord[]>
  members: ProjectMemberRecord[]
  authedUserId: string | null
  localMyTaskOwnerLabel: string
}

export function useTaskTablePipeline({
  taskManageList,
  taskTypeLabel,
  taskStageOptionTitles,
  targetActivityByKey,
  members,
  authedUserId,
  localMyTaskOwnerLabel: _localMyTaskOwnerLabel,
}: UseTaskTablePipelineParams) {
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all')
  const [taskSearchDraft, setTaskSearchDraft] = useState('')
  const [taskSearchApplied, setTaskSearchApplied] = useState('')
  const [taskSortKey, setTaskSortKey] = useState<TaskTableSortKey>('custom')
  const [taskGroupMode, setTaskGroupMode] = useState<TaskGroupMode>('stage')
  const [taskGroupShowEmpty, setTaskGroupShowEmpty] = useState(true)
  const [taskFilterPopoverOpen, setTaskFilterPopoverOpen] = useState(false)
  const [taskTableFilterDraft, setTaskTableFilterDraft] = useState<TaskManageTableFilterCondition[]>([])
  const [taskTableFilterApplied, setTaskTableFilterApplied] = useState<TaskManageTableFilterCondition[]>([])
  const [expandedTaskKeys, setExpandedTaskKeys] = useState<string[]>([])

  const taskDistinctBizTypes = useMemo(() => {
    const s = new Set<string>()
    const fallback = taskTypeLabel.trim() || '未分类'
    s.add(fallback)
    for (const t of flattenTaskManageRows(taskManageList)) {
      if (t.kind === 'stage') continue
      const x = (t.bizLabel ?? '').trim() || fallback
      s.add(x)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }, [taskManageList, taskTypeLabel])

  const targetOwnerFilterSelectOptions = useMemo(
    () => [{ value: TARGET_TABLE_FILTER_OWNER_UNASSIGNED, label: '未分配' }, ...members.map(m => ({ value: m.name, label: m.name }))],
    [members]
  )

  const taskTableFilterAppliedActive = useMemo(() => taskTableFilterApplied.some(taskManageTableFilterRowHasValue), [taskTableFilterApplied])

  const handleTaskFilterPopoverOpenChange = useCallback(
    (open: boolean) => {
      setTaskFilterPopoverOpen(open)
      if (open) {
        setTaskTableFilterDraft(taskTableFilterApplied.length > 0 ? taskTableFilterApplied.map(c => ({ ...c, id: newTaskManageTableFilterId() })) : [])
      }
    },
    [taskTableFilterApplied]
  )

  const commitTaskTableFilterDraft = useCallback(() => {
    const next = taskTableFilterDraft.filter(taskManageTableFilterRowHasValue)
    setTaskTableFilterApplied(next.map(c => ({ ...c, id: newTaskManageTableFilterId() })))
    setTaskFilterPopoverOpen(false)
  }, [taskTableFilterDraft])

  const resetTaskTableFilters = useCallback(() => {
    setTaskTableFilterDraft([])
    setTaskTableFilterApplied([])
  }, [])

  const renderTaskManageFilterValueControl = useCallback(
    (row: TaskManageTableFilterCondition): ReactNode => {
      const patch = (value: string) => setTaskTableFilterDraft(prev => prev.map(r => (r.id === row.id ? { ...r, value } : r)))
      if (row.field === 'title') {
        return <Input allowClear size="small" className="wt-target-filter-panel__value" value={row.value} placeholder="输入关键词" onChange={e => patch(e.target.value)} />
      }
      if (row.field === 'bizType') {
        return <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择任务类型" options={taskDistinctBizTypes.map(t => ({ value: t, label: t }))} onChange={v => patch((v as string) ?? '')} />
      }
      if (row.field === 'createdBy') {
        return <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择创建人" options={[{ value: '未指定', label: '未指定' }, ...members.map(m => ({ value: m.name, label: m.name }))]} onChange={v => patch((v as string) ?? '')} />
      }
      if (row.field === 'status') {
        return <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择状态" options={TASK_MANAGE_STATUS_FILTER_OPTIONS} onChange={v => patch((v as string) ?? '')} />
      }
      if (row.field === 'priority') {
        return (
          <Select
            allowClear
            size="small"
            className="wt-target-filter-panel__value"
            value={row.value || undefined}
            placeholder="选择优先级"
            options={TASK_PRIORITY_LEVELS.map((value: TaskPriorityLevel) => ({
              value,
              label: <PriorityWithMarks priority={value} />
            }))}
            onChange={v => patch((v as string) ?? '')}
          />
        )
      }
      if (row.field === 'stage') {
        return <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择项目阶段" options={taskStageOptionTitles.map(t => ({ value: t, label: t }))} onChange={v => patch((v as string) ?? '')} />
      }
      if (row.field === 'start' || row.field === 'end' || row.field === 'createdAt' || row.field === 'updatedAt' || row.field === 'completedAt') {
        const ph = row.field === 'start' ? '选择开始日期' : row.field === 'end' ? '选择截止日期' : row.field === 'createdAt' ? '选择创建日期' : row.field === 'updatedAt' ? '选择更新日期' : '选择完成日期'
        return <DatePicker allowClear size="small" className="wt-target-filter-panel__value" placeholder={ph} value={row.value ? dayjs(row.value, 'YYYY-MM-DD', true) : undefined} format="YYYY年M月D日" onChange={d => patch(d ? d.format('YYYY-MM-DD') : '')} />
      }
      return <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择负责人" options={targetOwnerFilterSelectOptions} onChange={v => patch((v as string) ?? '')} />
    },
    [members, taskDistinctBizTypes, taskStageOptionTitles, targetOwnerFilterSelectOptions]
  )

  const taskCompletedAtIsoByKey = useMemo(() => {
    const out: Record<string, string | undefined> = {}
    for (const t of flattenTaskManageRows(taskManageList)) {
      if (t.kind === 'stage') continue
      if (t.status !== '已完成' && t.status !== '关闭') {
        out[t.key] = undefined
        continue
      }
      out[t.key] = getTaskFilterCompletedAtIsoFromActivities(targetActivityByKey[t.key])
    }
    return out
  }, [taskManageList, targetActivityByKey])

  const taskRows = useMemo(() => {
    const cloneStage = (stage: TaskManageRecord, children: TaskManageRecord[] = []): TaskManageRecord => ({
      ...stage,
      children
    })
    const withStageProgress = (rows: TaskManageRecord[], sourceRows: TaskManageRecord[] = rows) =>
      rows.map(row => {
        if (row.kind !== 'stage') return row
        const sourceStage = sourceRows.find(x => x.kind === 'stage' && x.key === row.key)
        const progress = computeStageTasksProgressPercent(sourceStage?.children ?? [])
        return { ...row, progress }
      })
    let base: TaskManageRecord[]
    if (taskFilter === 'all') {
      base = withStageProgress(taskManageList)
    } else if (taskFilter === 'unassigned') {
      const unassignedRows = taskManageList.map(stage =>
        cloneStage(
          stage,
          (stage.children ?? []).filter(task => task.kind === 'task' && !task.owner)
        )
      )
      base = withStageProgress(unassignedRows, unassignedRows)
    } else if (taskFilter === 'mine') {
      const mineTasks: TaskManageRecord[] = []
      const isMineTask = (t: TaskManageRecord) => Boolean(authedUserId && t.ownerUserId === authedUserId)
      for (const stage of taskManageList) {
        for (const task of stage.children ?? []) {
          if (!isMineTask(task)) continue
          const mineSubtasks = (task.children ?? []).filter(sub => isMineTask(sub))
          mineTasks.push({
            ...task,
            children: mineSubtasks
          })
        }
      }
      base = mineTasks
    } else {
      base = flattenTaskManageRows(taskManageList).filter(task => isOverdueActiveTask(task))
    }
    let filtered = applyTaskManageTableFilterConditions(base, taskTableFilterApplied, taskTypeLabel, taskCompletedAtIsoByKey)
    filtered = filterTaskManageListByTitleSearch(filtered, taskSearchApplied)
    filtered = sortTaskForest(filtered, taskSortKey, taskCompletedAtIsoByKey)
    if (taskGroupMode === 'none') {
      filtered = flattenTaskRowsForNoGroupView(filtered)
    } else {
      filtered = withStageProgress(regroupTaskRows(filtered, taskGroupMode, taskGroupShowEmpty, taskTypeLabel, taskStageOptionTitles))
    }
    return filtered
  }, [taskFilter, taskManageList, authedUserId, taskSearchApplied, taskTableFilterApplied, taskCompletedAtIsoByKey, taskSortKey, taskGroupMode, taskGroupShowEmpty, taskTypeLabel, taskStageOptionTitles])

  const taskCount = useMemo(() => {
    const countChildren = (rows: TaskManageRecord[]): number =>
      rows.reduce((sum, row) => {
        if (row.kind === 'stage') return sum + countChildren(row.children ?? [])
        return sum + 1 + countChildren(row.children ?? [])
      }, 0)
    return countChildren(taskRows)
  }, [taskRows])

  const defaultExpandedKeys = useMemo(() => {
    const keys: string[] = []
    const walk = (rows: TaskManageRecord[]) => {
      rows.forEach(row => {
        if (row.children?.length) {
          keys.push(row.key)
          walk(row.children)
        }
      })
    }
    walk(taskRows)
    return keys
  }, [taskRows])

  useEffect(() => {
    setExpandedTaskKeys(prev => {
      if (prev.length === 0) return defaultExpandedKeys
      const available = new Set(defaultExpandedKeys)
      const kept = prev.filter(k => available.has(k))
      const missing = defaultExpandedKeys.filter(k => !kept.includes(k))
      return [...kept, ...missing]
    })
  }, [defaultExpandedKeys])

  const onTaskSearchSubmit = useCallback(() => setTaskSearchApplied(taskSearchDraft.trim()), [taskSearchDraft])
  const onTaskSearchClear = useCallback(() => {
    setTaskSearchDraft('')
    setTaskSearchApplied('')
  }, [])

  return {
    taskFilter,
    setTaskFilter,
    taskSearchDraft,
    setTaskSearchDraft,
    taskSearchApplied,
    onTaskSearchSubmit,
    onTaskSearchClear,
    taskSortKey,
    setTaskSortKey,
    taskGroupMode,
    setTaskGroupMode,
    taskGroupShowEmpty,
    setTaskGroupShowEmpty,
    taskFilterPopoverOpen,
    handleTaskFilterPopoverOpenChange,
    taskTableFilterDraft,
    setTaskTableFilterDraft,
    commitTaskTableFilterDraft,
    resetTaskTableFilters,
    taskTableFilterAppliedActive,
    renderTaskManageFilterValueControl,
    taskRows,
    taskCount,
    expandedTaskKeys,
    setExpandedTaskKeys
  }
}
