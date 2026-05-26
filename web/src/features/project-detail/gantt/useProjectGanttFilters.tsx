import { DatePicker, Input, Select } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { PriorityWithMarks, TASK_PRIORITY_LEVELS, type TaskPriorityLevel } from '../../../shared/ui/priorityWithMarks'
import {
  defaultOpForGanttFilterField,
  GANTT_FILTER_FIELD_OPTIONS,
  GANTT_FILTER_OWNER_UNASSIGNED,
  newGanttTableFilterId,
  opsForGanttFilterField,
  type GanttTableFilterCondition,
  type GanttTableSortKey
} from './ganttToolbarConfig'
import { applyGanttFilters, GANTT_STATUS_FILTER_OPTIONS, ganttFilterRowHasValue, sortGanttHierarchy } from './ganttTableFilters'
import type { GanttRowData } from './useProjectGanttData'

export type UseProjectGanttFiltersParams = {
  ganttRows: GanttRowData[]
  taskStageOptionTitles: string[]
  members: { key: string; name: string }[]
}

export function useProjectGanttFilters({ ganttRows, taskStageOptionTitles, members }: UseProjectGanttFiltersParams) {
  const [ganttSearchDraft, setGanttSearchDraft] = useState('')
  const [ganttSearchApplied, setGanttSearchApplied] = useState('')
  const [ganttSortKey, setGanttSortKey] = useState<GanttTableSortKey>('custom')
  const [ganttFilterDraft, setGanttFilterDraft] = useState<GanttTableFilterCondition[]>([])
  const [ganttFilterApplied, setGanttFilterApplied] = useState<GanttTableFilterCondition[]>([])
  const [ganttFilterPopoverOpen, setGanttFilterPopoverOpen] = useState(false)

  const ganttOwnerFilterOptions = useMemo(
    () => [{ value: GANTT_FILTER_OWNER_UNASSIGNED, label: '未分配' }, ...members.map(m => ({ value: m.name, label: m.name }))],
    [members]
  )
  const ganttFilterAppliedActive = useMemo(() => ganttFilterApplied.some(ganttFilterRowHasValue), [ganttFilterApplied])

  const handleGanttFilterPopoverOpenChange = useCallback(
    (open: boolean) => {
      setGanttFilterPopoverOpen(open)
      if (open) {
        setGanttFilterDraft(ganttFilterApplied.length > 0 ? ganttFilterApplied.map(c => ({ ...c, id: newGanttTableFilterId() })) : [])
      }
    },
    [ganttFilterApplied]
  )

  const commitGanttFilterDraft = useCallback(() => {
    const next = ganttFilterDraft.filter(ganttFilterRowHasValue)
    setGanttFilterApplied(next.map(c => ({ ...c, id: newGanttTableFilterId() })))
    setGanttFilterPopoverOpen(false)
  }, [ganttFilterDraft])

  const resetGanttFilters = useCallback(() => {
    setGanttFilterDraft([])
    setGanttFilterApplied([])
  }, [])

  const onGanttSearchSubmit = useCallback(() => setGanttSearchApplied(ganttSearchDraft.trim()), [ganttSearchDraft])
  const onGanttSearchClear = useCallback(() => {
    setGanttSearchDraft('')
    setGanttSearchApplied('')
  }, [])

  const ganttAfterSearch = useMemo(() => {
    const n = ganttSearchApplied.trim().toLowerCase()
    if (!n) return ganttRows
    return ganttRows.filter(r => r.title.toLowerCase().includes(n))
  }, [ganttRows, ganttSearchApplied])

  const ganttAfterFilter = useMemo(() => applyGanttFilters(ganttAfterSearch, ganttFilterApplied), [ganttAfterSearch, ganttFilterApplied])

  const ganttSorted = useMemo(() => sortGanttHierarchy(ganttAfterFilter, ganttSortKey), [ganttAfterFilter, ganttSortKey])

  const renderGanttFilterValue = useCallback(
    (row: GanttTableFilterCondition): ReactNode => {
      const patch = (value: string) => setGanttFilterDraft(prev => prev.map(r => (r.id === row.id ? { ...r, value } : r)))
      if (row.field === 'title') {
        return <Input allowClear size="small" className="wt-target-filter-panel__value" value={row.value} placeholder="输入关键词" onChange={e => patch(e.target.value)} />
      }
      if (row.field === 'status') {
        return (
          <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择状态" options={GANTT_STATUS_FILTER_OPTIONS} onChange={v => patch((v as string) ?? '')} />
        )
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
        return (
          <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择项目阶段" options={taskStageOptionTitles.map(t => ({ value: t, label: t }))} onChange={v => patch((v as string) ?? '')} />
        )
      }
      if (row.field === 'createdBy') {
        return (
          <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择创建人" options={[{ value: '未指定', label: '未指定' }, ...members.map(m => ({ value: m.name, label: m.name }))]} onChange={v => patch((v as string) ?? '')} />
        )
      }
      if (row.field === 'start' || row.field === 'end' || row.field === 'createdAt') {
        const ph = row.field === 'start' ? '选择开始日期' : row.field === 'end' ? '选择截止日期' : '选择创建日期'
        return (
          <DatePicker allowClear size="small" className="wt-target-filter-panel__value" placeholder={ph} value={row.value ? dayjs(row.value, 'YYYY-MM-DD', true) : undefined} format="YYYY年M月D日" onChange={d => patch(d ? d.format('YYYY-MM-DD') : '')} />
        )
      }
      return (
        <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择负责人" options={ganttOwnerFilterOptions} onChange={v => patch((v as string) ?? '')} />
      )
    },
    [ganttOwnerFilterOptions, members, taskStageOptionTitles]
  )

  return {
    ganttSearchDraft,
    setGanttSearchDraft,
    onGanttSearchSubmit,
    onGanttSearchClear,
    ganttSortKey,
    setGanttSortKey,
    ganttFilterPopoverOpen,
    handleGanttFilterPopoverOpenChange,
    ganttFilterDraft,
    setGanttFilterDraft,
    commitGanttFilterDraft,
    resetGanttFilters,
    ganttFilterAppliedActive,
    renderGanttFilterValue,
    ganttSorted,
    ganttFilterFieldOptions: GANTT_FILTER_FIELD_OPTIONS,
    defaultOpForGanttFilterField,
    opsForGanttFilterField,
    newGanttTableFilterId
  }
}
