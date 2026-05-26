import { DatePicker, Input, Select } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { PriorityWithMarks, TASK_PRIORITY_LEVELS, type TaskPriorityLevel } from '../../../shared/ui/priorityWithMarks'
import type { WorkspaceActivityRecord } from '../hooks/useProjectDetailWorkspace'
import type { ProjectMemberRecord } from '../settings/projectMemberRole'
import {
  applyTargetTableFilterConditions,
  newTargetTableFilterId,
  targetFilterRowHasValue,
  TARGET_TABLE_FILTER_OWNER_UNASSIGNED,
  type TargetTableFilterCondition
} from './targetTableFilters'
import { collectTargetGroupExpandKeys, isTargetGroupTableRow, regroupTargetTableRows, type TargetTableRow } from './targetTableGrouping'
import { sortTargetRecordsForTable } from './targetTableSort'
import type { TargetGroupMode, TargetTableSortKey } from './targetToolbarConfig'
import { getTargetFilterCompletedAtIsoFromActivities } from './targetActivityCompletedAt'
import { TARGET_STATUS_OPTIONS } from './targetStatusOptions'
import type { TargetFilter, TargetRecord } from './targetTypes'

export type UseTargetTablePipelineParams = {
  targetList: TargetRecord[]
  targetTypeLabel: string
  targetActivityByKey: Record<string, WorkspaceActivityRecord[]>
  members: ProjectMemberRecord[]
}

export function useTargetTablePipeline({ targetList, targetTypeLabel, targetActivityByKey, members }: UseTargetTablePipelineParams) {
  const [targetFilter, setTargetFilter] = useState<TargetFilter>('all')
  const [targetSearchDraft, setTargetSearchDraft] = useState('')
  const [targetSearchApplied, setTargetSearchApplied] = useState('')
  const [targetFilterPopoverOpen, setTargetFilterPopoverOpen] = useState(false)
  const [targetTableFilterDraft, setTargetTableFilterDraft] = useState<TargetTableFilterCondition[]>([])
  const [targetTableFilterApplied, setTargetTableFilterApplied] = useState<TargetTableFilterCondition[]>([])
  const [targetSortKey, setTargetSortKey] = useState<TargetTableSortKey>('custom')
  const [targetGroupMode, setTargetGroupMode] = useState<TargetGroupMode>('none')
  const [targetGroupShowEmpty, setTargetGroupShowEmpty] = useState(true)
  const [expandedTargetGroupKeys, setExpandedTargetGroupKeys] = useState<string[]>([])

  const targetDistinctTypes = useMemo(() => {
    const s = new Set<string>()
    for (const t of targetList) {
      const x = (t.type ?? '').trim()
      if (x) s.add(x)
    }
    return [...s].sort()
  }, [targetList])

  const targetOwnerFilterSelectOptions = useMemo(
    () => [{ value: TARGET_TABLE_FILTER_OWNER_UNASSIGNED, label: '未分配' }, ...members.map(m => ({ value: m.name, label: m.name }))],
    [members]
  )
  const targetParticipantFilterOptions = useMemo(() => members.map(m => ({ value: m.name, label: m.name })), [members])
  const targetTableFilterAppliedActive = useMemo(() => targetTableFilterApplied.some(targetFilterRowHasValue), [targetTableFilterApplied])

  const handleTargetFilterPopoverOpenChange = useCallback(
    (open: boolean) => {
      setTargetFilterPopoverOpen(open)
      if (open) {
        setTargetTableFilterDraft(targetTableFilterApplied.length > 0 ? targetTableFilterApplied.map(c => ({ ...c, id: newTargetTableFilterId() })) : [])
      }
    },
    [targetTableFilterApplied]
  )

  const commitTargetTableFilterDraft = useCallback(() => {
    const next = targetTableFilterDraft.filter(targetFilterRowHasValue)
    setTargetTableFilterApplied(next.map(c => ({ ...c, id: newTargetTableFilterId() })))
    setTargetFilterPopoverOpen(false)
  }, [targetTableFilterDraft])

  const resetTargetTableFilters = useCallback(() => {
    setTargetTableFilterDraft([])
    setTargetTableFilterApplied([])
  }, [])

  const renderTargetFilterValueControl = useCallback(
    (row: TargetTableFilterCondition): ReactNode => {
      const patch = (value: string) => setTargetTableFilterDraft(prev => prev.map(r => (r.id === row.id ? { ...r, value } : r)))
      if (row.field === 'title') {
        return <Input allowClear size="small" className="wt-target-filter-panel__value" value={row.value} placeholder="输入关键词" onChange={e => patch(e.target.value)} />
      }
      if (row.field === 'participants') {
        return <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择参与人" options={targetParticipantFilterOptions} onChange={v => patch((v as string) ?? '')} />
      }
      if (row.field === 'status') {
        return <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择状态类型" options={TARGET_STATUS_OPTIONS} onChange={v => patch((v as string) ?? '')} />
      }
      if (row.field === 'type') {
        return targetDistinctTypes.length > 0 ? (
          <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择任务类型" options={targetDistinctTypes.map(t => ({ value: t, label: t }))} onChange={v => patch((v as string) ?? '')} />
        ) : (
          <Input allowClear size="small" className="wt-target-filter-panel__value" value={row.value} placeholder="输入任务类型" onChange={e => patch(e.target.value)} />
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
      if (row.field === 'createdAt' || row.field === 'startDate' || row.field === 'endDate' || row.field === 'completedAt') {
        const ph = row.field === 'createdAt' ? '选择创建日期' : row.field === 'startDate' ? '选择开始日期' : row.field === 'endDate' ? '选择截止日期' : '选择完成日期'
        return <DatePicker allowClear size="small" className="wt-target-filter-panel__value" placeholder={ph} value={row.value ? dayjs(row.value, 'YYYY-MM-DD', true) : undefined} format="YYYY年M月D日" onChange={d => patch(d ? d.format('YYYY-MM-DD') : '')} />
      }
      return <Select allowClear size="small" className="wt-target-filter-panel__value" value={row.value || undefined} placeholder="选择负责人" options={targetOwnerFilterSelectOptions} onChange={v => patch((v as string) ?? '')} />
    },
    [targetDistinctTypes, targetOwnerFilterSelectOptions, targetParticipantFilterOptions]
  )

  const targetCompletedAtIsoByKey = useMemo(() => {
    const out: Record<string, string | undefined> = {}
    for (const t of targetList) {
      if (t.status !== '已完成' && t.status !== '关闭') {
        out[t.key] = undefined
        continue
      }
      out[t.key] = getTargetFilterCompletedAtIsoFromActivities(targetActivityByKey[t.key])
    }
    return out
  }, [targetList, targetActivityByKey])

  const filteredTargets = useMemo(() => {
    let list = targetList
    if (targetFilter === 'risk') list = list.filter(row => row.status === '进行中' || row.status === '验收中')
    else if (targetFilter === 'done') list = list.filter(row => row.status === '已完成')
    const needle = targetSearchApplied.trim().toLowerCase()
    if (needle) list = list.filter(t => t.title.toLowerCase().includes(needle))
    list = applyTargetTableFilterConditions(list, targetTableFilterApplied, targetCompletedAtIsoByKey)
    return sortTargetRecordsForTable(list, targetSortKey, targetCompletedAtIsoByKey)
  }, [targetFilter, targetList, targetSearchApplied, targetTableFilterApplied, targetCompletedAtIsoByKey, targetSortKey])

  const targetGrouped = targetGroupMode !== 'none' && targetGroupMode !== 'custom'

  const targetDisplayRows = useMemo((): TargetTableRow[] => {
    if (!targetGrouped) return filteredTargets
    return regroupTargetTableRows(filteredTargets, targetGroupMode, targetGroupShowEmpty, targetTypeLabel)
  }, [filteredTargets, targetGrouped, targetGroupMode, targetGroupShowEmpty, targetTypeLabel])

  const defaultExpandedTargetGroupKeys = useMemo(() => {
    if (!targetGrouped) return [] as string[]
    return collectTargetGroupExpandKeys(targetDisplayRows.filter(isTargetGroupTableRow))
  }, [targetDisplayRows, targetGrouped])

  useEffect(() => {
    if (!targetGrouped) {
      setExpandedTargetGroupKeys([])
      return
    }
    setExpandedTargetGroupKeys(prev => {
      if (prev.length === 0) return defaultExpandedTargetGroupKeys
      const available = new Set(defaultExpandedTargetGroupKeys)
      const kept = prev.filter(k => available.has(k))
      const missing = defaultExpandedTargetGroupKeys.filter(k => !kept.includes(k))
      return [...kept, ...missing]
    })
  }, [defaultExpandedTargetGroupKeys, targetGrouped])

  const onTargetSearchSubmit = useCallback(() => setTargetSearchApplied(targetSearchDraft.trim()), [targetSearchDraft])
  const onTargetSearchClear = useCallback(() => {
    setTargetSearchDraft('')
    setTargetSearchApplied('')
  }, [])

  return {
    targetFilter,
    setTargetFilter,
    targetSearchDraft,
    setTargetSearchDraft,
    targetSearchApplied,
    onTargetSearchSubmit,
    onTargetSearchClear,
    targetFilterPopoverOpen,
    handleTargetFilterPopoverOpenChange,
    targetTableFilterDraft,
    setTargetTableFilterDraft,
    commitTargetTableFilterDraft,
    resetTargetTableFilters,
    targetTableFilterAppliedActive,
    renderTargetFilterValueControl,
    targetSortKey,
    setTargetSortKey,
    targetGroupMode,
    setTargetGroupMode,
    targetGroupShowEmpty,
    setTargetGroupShowEmpty,
    targetGrouped,
    filteredTargets,
    targetDisplayRows,
    expandedTargetGroupKeys,
    setExpandedTargetGroupKeys
  }
}
