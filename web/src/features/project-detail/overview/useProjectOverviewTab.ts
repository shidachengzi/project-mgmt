import { message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FormInstance } from 'antd/es/form'
import type { Dayjs } from 'dayjs'
import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useMemo } from 'react'
import { collectFleetDateViolationsForProjectWindow, validateProjectWindow } from '../projectDateValidation'
import type { TaskManageRecord } from '../tasks/taskTypes'
import { flattenTaskManageRows, getTaskManageRowsForOverviewStats, getTodaySortNumber, isOverdueActiveTask, isTaskFinished, taskDateToSortNumber } from '../tasks'
import type { TargetRecord } from '../targets'
import { parseDateValue, stripHtmlToPlain } from './projectOverviewDisplayUtils'
import { useOverviewReminderTableColumns } from './useOverviewReminderTableColumns.tsx'
import type { OverviewEditingField, OverviewTaskStats, ProjectOverviewInfo } from './overviewTypes'
import type { ProjectOverviewReminderRow } from './overviewReminderTypes'

export type UseProjectOverviewTabParams = {
  isPersonalDeskProject: boolean
  projectOverview: ProjectOverviewInfo
  setProjectOverview: Dispatch<SetStateAction<ProjectOverviewInfo>>
  setEditingOverviewField: Dispatch<SetStateAction<OverviewEditingField>>
  setOverviewTitleDraft: Dispatch<SetStateAction<string>>
  setOverviewDescriptionDraft: Dispatch<SetStateAction<string>>
  projectSettingsMeta: { startDate: string; endDate: string }
  targetList: TargetRecord[]
  taskManageList: TaskManageRecord[]
  canConfigureOverviewReminders: boolean
  overviewReminderForm: FormInstance
  setOverviewReminderEditingId: Dispatch<SetStateAction<string | null>>
  setOverviewReminderEditorOpen: Dispatch<SetStateAction<boolean>>
  setProjectOverviewReminders: Dispatch<SetStateAction<ProjectOverviewReminderRow[]>>
  backendMemberRows: Array<{ email: string | null }> | undefined
  members: Array<{ dept?: string | null }>
  flushWorkspaceNow: () => void
}

export type UseProjectOverviewTabResult = {
  membersWithEmailCount: number
  overviewTaskStats: OverviewTaskStats
  overviewActualGoalProgressPercent: number
  overviewReminderTableColumns: ColumnsType<ProjectOverviewReminderRow>
  onBeginEditOverviewTitle: () => void
  onBeginEditOverviewDescription: () => void
  onOverviewStartDatePick: (date: Dayjs | null) => void
  onOverviewEndDatePick: (date: Dayjs | null) => void
}

export function useProjectOverviewTab({
  isPersonalDeskProject,
  projectOverview,
  setProjectOverview,
  setEditingOverviewField,
  setOverviewTitleDraft,
  setOverviewDescriptionDraft,
  projectSettingsMeta,
  targetList,
  taskManageList,
  canConfigureOverviewReminders,
  overviewReminderForm,
  setOverviewReminderEditingId,
  setOverviewReminderEditorOpen,
  setProjectOverviewReminders,
  backendMemberRows,
  members,
  flushWorkspaceNow
}: UseProjectOverviewTabParams): UseProjectOverviewTabResult {
  const membersWithEmailCount = useMemo(() => {
    if (Array.isArray(backendMemberRows) && backendMemberRows.length > 0) {
      return backendMemberRows.filter(r => (r.email ?? '').trim().includes('@')).length
    }
    return members.filter(m => (m.dept ?? '').includes('@')).length
  }, [backendMemberRows, members])

  const overviewTaskStats = useMemo(() => {
    const allTasks = getTaskManageRowsForOverviewStats(taskManageList)
    const total = allTasks.length
    const done = allTasks.filter(x => isTaskFinished(x)).length
    const running = allTasks.filter(x => x.status === '进行中').length
    const notStarted = allTasks.filter(x => x.status === '未开始').length
    const overdue = allTasks.filter(x => isOverdueActiveTask(x)).length
    const todayDue = allTasks.filter(x => taskDateToSortNumber(x.end) === getTodaySortNumber() && !isTaskFinished(x)).length
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0
    const overdueRate = total > 0 ? Math.round((overdue / total) * 100) : 0
    return { total, done, running, notStarted, overdue, todayDue, completionRate, overdueRate }
  }, [taskManageList])

  /** 「实际目标进展」：有目标时按目标完成/关闭占比；否则按任务统计同口径下的任务完成+关闭占比 */
  const overviewActualGoalProgressPercent = useMemo(() => {
    if (targetList.length > 0) {
      const fin = targetList.filter(t => t.status === '已完成' || t.status === '关闭').length
      return Math.round((fin / targetList.length) * 100)
    }
    const allTasks = getTaskManageRowsForOverviewStats(taskManageList)
    const total = allTasks.length
    if (total === 0) return 0
    const fin = allTasks.filter(x => x.status === '已完成' || x.status === '关闭').length
    return Math.round((fin / total) * 100)
  }, [targetList, taskManageList])

  const overviewReminderTableColumns: ColumnsType<ProjectOverviewReminderRow> = useOverviewReminderTableColumns(
    canConfigureOverviewReminders,
    overviewReminderForm,
    row => {
      setOverviewReminderEditingId(row.id)
      setOverviewReminderEditorOpen(true)
    },
    id => setProjectOverviewReminders(prev => prev.filter(r => r.id !== id))
  )

  const onBeginEditOverviewTitle = useCallback(() => {
    setOverviewTitleDraft(projectOverview.title)
    setEditingOverviewField('title')
  }, [projectOverview.title, setEditingOverviewField, setOverviewTitleDraft])

  const onBeginEditOverviewDescription = useCallback(() => {
    const raw = projectOverview.description
    const plain = stripHtmlToPlain(raw === '无' ? '' : raw)
    if (plain !== raw && raw !== '无') {
      setProjectOverview(prev => ({ ...prev, description: plain.trim() ? plain.trim() : '无' }))
    }
    setOverviewDescriptionDraft(raw === '无' ? '' : plain.trim() ? plain.trim() : '')
    setEditingOverviewField('description')
  }, [projectOverview.description, setEditingOverviewField, setOverviewDescriptionDraft, setProjectOverview])

  const onOverviewStartDatePick = useCallback(
    (date: Dayjs | null) => {
      if (!date) {
        setEditingOverviewField(null)
        return
      }
      const nextStart = date.format('YYYY-MM-DD')
      const endIso = parseDateValue(projectOverview.endDate)?.format('YYYY-MM-DD') ?? projectSettingsMeta.endDate
      const win = validateProjectWindow(nextStart, endIso)
      if (!win.ok) {
        message.warning(win.message)
        setEditingOverviewField(null)
        return
      }
      if (!isPersonalDeskProject) {
        const flat = flattenTaskManageRows(taskManageList)
        const fleet = collectFleetDateViolationsForProjectWindow(nextStart, endIso, targetList, flat)
        if (fleet.length) {
          const preview = fleet.slice(0, 3).join('；')
          message.warning(fleet.length > 3 ? `${preview}…共 ${fleet.length} 处` : preview)
          setEditingOverviewField(null)
          return
        }
      }
      setProjectOverview(prev => ({
        ...prev,
        startDate: nextStart
      }))
      setEditingOverviewField(null)
      flushWorkspaceNow()
    },
    [isPersonalDeskProject, projectOverview.endDate, projectSettingsMeta.endDate, setEditingOverviewField, setProjectOverview, targetList, taskManageList, flushWorkspaceNow]
  )

  const onOverviewEndDatePick = useCallback(
    (date: Dayjs | null) => {
      if (!date) {
        setEditingOverviewField(null)
        return
      }
      const nextEnd = date.format('YYYY-MM-DD')
      const startIso = parseDateValue(projectOverview.startDate)?.format('YYYY-MM-DD') ?? projectSettingsMeta.startDate
      const win = validateProjectWindow(startIso, nextEnd)
      if (!win.ok) {
        message.warning(win.message)
        setEditingOverviewField(null)
        return
      }
      if (!isPersonalDeskProject) {
        const flat = flattenTaskManageRows(taskManageList)
        const fleet = collectFleetDateViolationsForProjectWindow(startIso, nextEnd, targetList, flat)
        if (fleet.length) {
          const preview = fleet.slice(0, 3).join('；')
          message.warning(fleet.length > 3 ? `${preview}…共 ${fleet.length} 处` : preview)
          setEditingOverviewField(null)
          return
        }
      }
      setProjectOverview(prev => ({
        ...prev,
        endDate: nextEnd
      }))
      setEditingOverviewField(null)
      flushWorkspaceNow()
    },
    [isPersonalDeskProject, projectOverview.startDate, projectSettingsMeta.startDate, setEditingOverviewField, setProjectOverview, targetList, taskManageList, flushWorkspaceNow]
  )

  return {
    membersWithEmailCount,
    overviewTaskStats,
    overviewActualGoalProgressPercent,
    overviewReminderTableColumns,
    onBeginEditOverviewTitle,
    onBeginEditOverviewDescription,
    onOverviewStartDatePick,
    onOverviewEndDatePick
  }
}
