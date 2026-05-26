import dayjs from 'dayjs'
import { useMemo } from 'react'
import { parseMonthDayDate } from '../tasks/taskDateUtils'
import type { TaskManageRecord } from '../tasks/taskTypes'

export type GanttRowData = {
  key: string
  title: string
  owner?: string
  ownerUserId?: string | null
  status: TaskManageRecord['status']
  priority: TaskManageRecord['priority']
  stageTitle: string
  createdAt?: string
  createdBy?: string
  startLabel: string
  endLabel: string
  startDate: dayjs.Dayjs
  endDate: dayjs.Dayjs
  depth: number
  parentKey: string | null
  hasChildren?: boolean
}

export type UseProjectGanttDataParams = {
  taskManageList: TaskManageRecord[]
  ganttExpandLevel: number
}

export function useProjectGanttData({ taskManageList, ganttExpandLevel }: UseProjectGanttDataParams) {
  const ganttRows = useMemo(() => {
    const result: GanttRowData[] = []
    const maxLevel = Math.min(5, Math.max(1, ganttExpandLevel))
    const pushRow = (
      row: TaskManageRecord,
      stageTitle: string,
      depth: number,
      parentKey: string | null,
      hasChildren?: boolean
    ) => {
      const startDate = parseMonthDayDate(row.start)
      const endDate = parseMonthDayDate(row.end)
      if (!startDate || !endDate) return
      result.push({
        key: row.key,
        title: row.title,
        owner: row.owner,
        ownerUserId: row.ownerUserId ?? null,
        status: row.status,
        priority: row.priority,
        stageTitle: stageTitle || row.stage || '—',
        createdAt: row.createdAt,
        createdBy: row.createdBy,
        startLabel: row.start,
        endLabel: row.end,
        startDate: startDate.startOf('day'),
        endDate: endDate.startOf('day'),
        depth,
        parentKey,
        ...(depth === 1 && hasChildren !== undefined ? { hasChildren } : {})
      })
    }
    for (const stage of taskManageList) {
      if (stage.kind !== 'stage') continue
      const stTitle = stage.title
      for (const task of stage.children ?? []) {
        if (task.kind !== 'task') continue
        const hasSubRows =
          maxLevel >= 2 &&
          (task.children ?? []).some(c => c.kind === 'subtask' && parseMonthDayDate(c.start) && parseMonthDayDate(c.end))
        if (maxLevel >= 1) {
          pushRow(task, stTitle, 1, null, hasSubRows)
        }
        if (maxLevel >= 2) {
          for (const sub of task.children ?? []) {
            if (sub.kind !== 'subtask') continue
            pushRow(sub, stTitle, 2, task.key)
          }
        }
      }
    }
    return result
  }, [taskManageList, ganttExpandLevel])

  const ganttRange = useMemo(() => {
    if (!ganttRows.length) {
      const base = dayjs().startOf('month')
      return { start: base, end: base.add(29, 'day') }
    }
    let start = ganttRows[0].startDate
    let end = ganttRows[0].endDate
    ganttRows.forEach(row => {
      if (row.startDate.isBefore(start, 'day')) start = row.startDate
      if (row.endDate.isAfter(end, 'day')) end = row.endDate
    })
    return {
      start: start.startOf('day').subtract(3, 'day'),
      end: end.endOf('day').add(3, 'day')
    }
  }, [ganttRows])

  const ganttDays = useMemo(() => {
    const span = Math.max(1, ganttRange.end.diff(ganttRange.start, 'day') + 1)
    return Array.from({ length: span }, (_, index) => ganttRange.start.add(index, 'day'))
  }, [ganttRange.end, ganttRange.start])

  return { ganttRows, ganttRange, ganttDays }
}
