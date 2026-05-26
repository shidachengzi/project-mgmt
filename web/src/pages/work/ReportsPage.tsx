import { Avatar, Modal, Progress, Table, Tabs, Typography, message } from 'antd'
import { ReportsTableBodySkeleton } from './ReportsTableBodySkeleton'
import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { defaultProjectTemplateId } from '../../entities/project/config/projectTemplates'
import { PERSONAL_DESK_PROJECT_ID } from '../../entities/project/lib/personalDesk'
import type { ProjectSummary } from '../../entities/project/model/types'
import { ProjectDetailPage } from '../projects/ProjectDetailPage'
import { UnifiedWorkflowStatusTag, unifiedOwnerAvatarInitials } from '../../shared/ui/unifiedWorkflowStatusTag'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { fetchReportsTaskSummary, type ReportProjectTaskSummaryDTO } from '../../shared/api/reportsApi'

type ReportsPageProps = {
  projectList: ProjectSummary[]
  reportType?: 'project' | 'member'
}

type TaskRecordLite = {
  key: string
  kind: 'stage' | 'task' | 'subtask' | 'target'
  seq?: number
  title?: string
  status?: string
  owner?: string
  end?: string
  endDate?: string
  dueAt?: string
  overdue?: string
  projectId?: string
  projectName?: string
  children?: TaskRecordLite[]
}

type ReportRow = {
  key: string
  projectName: string
  projectStatus: string
  total: number
  todo: number
  doing: number
  done: number
  percent: number
  overdue: boolean
  delayTodo: number
  delayDone: number
  delayRate: number
  tasks: TaskRecordLite[]
}

type MemberReportRow = {
  key: string
  member: string
  total: number
  todo: number
  doing: number
  done: number
  percent: number
}

type DetailFilter = 'all' | 'todo' | 'doing' | 'done' | 'delayTodo' | 'delayDone'

const DETAIL_FILTER_TITLE: Record<DetailFilter, string> = {
  all: '总任务',
  todo: '未开始',
  doing: '进行中',
  done: '已完成',
  delayTodo: '延期未完成',
  delayDone: '延期已完成'
}

/** 项目 / 成员主表分页（明细弹窗内表格已有独立分页） */
const REPORTS_MAIN_TABLE_PAGINATION = {
  defaultPageSize: 10,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条`
}

const flattenTaskTree = (rows: TaskRecordLite[]): TaskRecordLite[] =>
  rows.flatMap(row => {
    if (row.kind === 'stage') return flattenTaskTree(row.children ?? [])
    return [row, ...flattenTaskTree(row.children ?? [])]
  })

const isDone = (status?: string) => status === '已完成' || status === '关闭'
const isDoing = (status?: string) => status === '进行中' || status === '验收中' || status === '搁置中'
const isTodo = (status?: string) => status === '未开始' || (!status ? true : !isDone(status) && !isDoing(status))

const parseDeadline = (task: TaskRecordLite) => {
  const raw = task.end ?? task.endDate ?? task.dueAt ?? task.overdue
  if (!raw) return null
  const d = dayjs(raw)
  if (d.isValid()) return d
  const md = String(raw).match(/^(\d{1,2})月(\d{1,2})日$/)
  if (md) {
    const year = dayjs().year()
    const fixed = dayjs(`${year}-${md[1]}-${md[2]}`)
    return fixed.isValid() ? fixed : null
  }
  return null
}

const isDelayedTask = (task: TaskRecordLite) => {
  const dl = parseDeadline(task)
  if (!dl) return false
  return dl.endOf('day').isBefore(dayjs())
}

const toDeadlineText = (task: TaskRecordLite) => {
  const raw = task.end ?? task.endDate ?? task.dueAt ?? task.overdue
  if (!raw) return '-'
  const d = dayjs(raw)
  if (d.isValid()) return d.format('YYYY年M月D日')
  return String(raw)
}

function buildReportRowsFromApiPayload(data: ReportProjectTaskSummaryDTO[]): ReportRow[] {
  return data
    .filter(p => p.projectId !== PERSONAL_DESK_PROJECT_ID)
    .map(project => {
      const allTasks: TaskRecordLite[] = project.tasks.map(t => ({
        key: t.key,
        kind: (t.kind === 'stage' ? 'task' : t.kind) as TaskRecordLite['kind'],
        title: t.title,
        status: t.status,
        owner: t.owner ?? undefined,
        end: t.end,
        projectId: project.projectId,
        projectName: project.projectTitle
      }))

      const total = allTasks.length
      const done = allTasks.filter(t => isDone(t.status)).length
      const doing = allTasks.filter(t => isDoing(t.status)).length
      const todo = Math.max(0, total - done - doing)
      const percent = total > 0 ? Number(((done / total) * 100).toFixed(2)) : 0

      const delayedTasks = allTasks.filter(t => isDelayedTask(t))
      const delayTodo = delayedTasks.filter(t => !isDone(t.status)).length
      const delayDone = delayedTasks.filter(t => isDone(t.status)).length
      const delayRate = total > 0 ? Number((((delayTodo + delayDone) / total) * 100).toFixed(2)) : 0

      const projectStatus = project.projectStatus?.trim() || '-'
      const end = project.projectEndDate
      const overdue = !!end && dayjs(end, 'YYYY-MM-DD', true).isValid() && dayjs(end).isBefore(dayjs(), 'day') && percent < 100

      return {
        key: project.projectId,
        projectName: project.projectTitle,
        projectStatus,
        total,
        todo,
        doing,
        done,
        percent,
        overdue,
        delayTodo,
        delayDone,
        delayRate,
        tasks: allTasks
      }
    })
    .sort((a, b) => b.total - a.total)
}

export function ReportsPage({ projectList, reportType = 'project' }: ReportsPageProps) {
  const [activeReportTab, setActiveReportTab] = useState<'progress' | 'delay'>('progress')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<ReportRow | null>(null)
  const [detailFilter, setDetailFilter] = useState<DetailFilter>('all')
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskRecordLite | null>(null)
  /** 关闭任务详情等场景下递增，用于重新拉取报表 / 触发本地行重算 */
  const [reportsDataRevision, setReportsDataRevision] = useState(0)

  type ReportsFetchState = { kind: 'loading' } | { kind: 'ok'; projects: ReportProjectTaskSummaryDTO[] } | { kind: 'error' }

  const [fetchState, setFetchState] = useState<ReportsFetchState>({ kind: 'loading' })

  const projectListIdsKey = useMemo(
    () =>
      projectList
        .map(p => p.id)
        .sort()
        .join('|'),
    [projectList]
  )

  const lastProjectListIdsKeyRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const listKeyChanged = lastProjectListIdsKeyRef.current !== projectListIdsKey
    lastProjectListIdsKeyRef.current = projectListIdsKey

    const showTableLoading = listKeyChanged || reportsDataRevision === 0
    if (showTableLoading) {
      setFetchState({ kind: 'loading' })
    }

    void (async () => {
      const res = await fetchReportsTaskSummary()
      if (cancelled) return
      if (!res.ok) {
        message.error(res.message)
        if (showTableLoading) {
          setFetchState({ kind: 'error' })
        }
        return
      }
      setFetchState({ kind: 'ok', projects: res.data })
    })()
    return () => {
      cancelled = true
    }
  }, [projectListIdsKey, reportsDataRevision])

  const handleCloseTaskDetail = () => {
    setTaskDetailOpen(false)
    setReportsDataRevision(n => n + 1)
  }

  const rows = useMemo<ReportRow[]>(() => {
    if (fetchState.kind === 'loading' || fetchState.kind === 'error') return []
    return buildReportRowsFromApiPayload(fetchState.projects)
  }, [fetchState])

  /** 主表数据更新后，同步仍打开的任务明细弹窗数据源 */
  useEffect(() => {
    if (!detailOpen || !detailRow) return
    if (rows.length === 0) return
    const rowKey = detailRow.key
    if (!String(rowKey).startsWith('member:')) {
      const fresh = rows.find(r => r.key === rowKey)
      if (fresh) setDetailRow(fresh)
      return
    }
    const member = String(rowKey).slice('member:'.length)
    const memberTasks = rows.flatMap(r => r.tasks).filter(t => (t.owner ?? '').trim() === member)
    const total = memberTasks.length
    const done = memberTasks.filter(t => isDone(t.status)).length
    const doing = memberTasks.filter(t => isDoing(t.status)).length
    const todo = Math.max(0, total - done - doing)
    const percent = total > 0 ? Number(((done / total) * 100).toFixed(2)) : 0
    const delayedTasks = memberTasks.filter(t => isDelayedTask(t))
    const delayTodo = delayedTasks.filter(t => !isDone(t.status)).length
    const delayDone = delayedTasks.filter(t => isDone(t.status)).length
    const delayRate = total > 0 ? Number((((delayTodo + delayDone) / total) * 100).toFixed(2)) : 0
    setDetailRow({
      key: rowKey,
      projectName: `${member} 的任务`,
      projectStatus: '-',
      total,
      todo,
      doing,
      done,
      percent,
      overdue: false,
      delayTodo,
      delayDone,
      delayRate,
      tasks: memberTasks
    })
  }, [rows, detailOpen, detailRow?.key])

  const reportTableLoading = isBackendAuthEnabled() && fetchState.kind === 'loading'

  const reportSkeletonColumnCount: 6 | 7 | 8 =
    reportType === 'member' ? 6 : activeReportTab === 'delay' ? 8 : 7

  const progressSummary = useMemo(() => {
    const projectCount = rows.length
    const total = rows.reduce((s, r) => s + r.total, 0)
    const todo = rows.reduce((s, r) => s + r.todo, 0)
    const doing = rows.reduce((s, r) => s + r.doing, 0)
    const done = rows.reduce((s, r) => s + r.done, 0)
    const percent = total > 0 ? Number(((done / total) * 100).toFixed(2)) : 0
    return { projectCount, total, todo, doing, done, percent }
  }, [rows])

  const delaySummary = useMemo(() => {
    const projectCount = rows.length
    const total = rows.reduce((s, r) => s + r.total, 0)
    const todo = rows.reduce((s, r) => s + r.delayTodo, 0)
    const doing = rows.reduce((s, r) => s + r.doing, 0)
    const done = rows.reduce((s, r) => s + r.delayDone, 0)
    const percent = total > 0 ? Number((((todo + done) / total) * 100).toFixed(2)) : 0
    return { projectCount, total, todo, doing, done, percent }
  }, [rows])

  const summary = activeReportTab === 'delay' ? delaySummary : progressSummary

  const memberRows = useMemo<MemberReportRow[]>(() => {
    const map = new Map<string, { total: number; todo: number; doing: number; done: number }>()
    rows.forEach(project => {
      project.tasks.forEach(task => {
        const member = (task.owner ?? '').trim()
        if (!member) return
        const prev = map.get(member) ?? { total: 0, todo: 0, doing: 0, done: 0 }
        prev.total += 1
        if (isDone(task.status)) prev.done += 1
        else if (isDoing(task.status)) prev.doing += 1
        else prev.todo += 1
        map.set(member, prev)
      })
    })
    return Array.from(map.entries())
      .map(([member, v]) => ({
        key: member,
        member,
        total: v.total,
        todo: v.todo,
        doing: v.doing,
        done: v.done,
        percent: v.total > 0 ? Number(((v.done / v.total) * 100).toFixed(2)) : 0
      }))
      .sort((a, b) => b.total - a.total)
  }, [rows])

  const memberDelayRows = useMemo<MemberReportRow[]>(() => {
    const map = new Map<string, { total: number; todo: number; doing: number; done: number }>()
    rows.forEach(project => {
      project.tasks.forEach(task => {
        const member = (task.owner ?? '').trim()
        if (!member || !isDelayedTask(task)) return
        const prev = map.get(member) ?? { total: 0, todo: 0, doing: 0, done: 0 }
        prev.total += 1
        if (isDone(task.status)) prev.done += 1
        else if (isDoing(task.status)) prev.doing += 1
        else prev.todo += 1
        map.set(member, prev)
      })
    })
    return Array.from(map.entries())
      .map(([member, v]) => ({
        key: member,
        member,
        total: v.total,
        todo: v.todo,
        doing: v.doing,
        done: v.done,
        percent: v.total > 0 ? Number(((v.done / v.total) * 100).toFixed(2)) : 0
      }))
      .sort((a, b) => b.total - a.total)
  }, [rows])

  const memberSummary = useMemo(() => {
    const src = activeReportTab === 'delay' ? memberDelayRows : memberRows
    const projectCount = src.length
    const total = src.reduce((s, r) => s + r.total, 0)
    const todo = src.reduce((s, r) => s + r.todo, 0)
    const doing = src.reduce((s, r) => s + r.doing, 0)
    const done = src.reduce((s, r) => s + r.done, 0)
    const percent = total > 0 ? Number(((done / total) * 100).toFixed(2)) : 0
    return { projectCount, total, todo, doing, done, percent }
  }, [activeReportTab, memberDelayRows, memberRows])

  const openDetail = (row: ReportRow, filter: DetailFilter) => {
    setDetailRow(row)
    setDetailFilter(filter)
    setDetailOpen(true)
  }

  const renderProjectStatusCell = (value: string) => (value === '-' ? '-' : <UnifiedWorkflowStatusTag status={value} />)

  const progressColumns: ColumnsType<ReportRow> = [
    { title: '项目', dataIndex: 'projectName', key: 'projectName', width: 260 },
    {
      title: '项目状态',
      dataIndex: 'projectStatus',
      key: 'projectStatus',
      width: 140,
      render: renderProjectStatusCell
    },
    {
      title: '总任务',
      dataIndex: 'total',
      key: 'total',
      width: 110,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openDetail(row, 'all')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: '未开始',
      dataIndex: 'todo',
      key: 'todo',
      width: 110,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openDetail(row, 'todo')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: '进行中',
      dataIndex: 'doing',
      key: 'doing',
      width: 110,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openDetail(row, 'doing')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: '已完成',
      dataIndex: 'done',
      key: 'done',
      width: 110,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openDetail(row, 'done')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: '完成率',
      dataIndex: 'percent',
      key: 'percent',
      width: 220,
      render: (value: number) => (
        <div className="wt-reports__progress-cell">
          <Progress percent={value} showInfo={false} size="small" strokeColor="#52c41a" trailColor="#f0f0f0" />
          <span>{value}%</span>
        </div>
      )
    }
  ]

  const delayColumns: ColumnsType<ReportRow> = [
    { title: '项目', dataIndex: 'projectName', key: 'projectName', width: 220 },
    {
      title: '项目状态',
      dataIndex: 'projectStatus',
      key: 'projectStatus',
      width: 120,
      render: renderProjectStatusCell
    },
    {
      title: '待处理任务',
      dataIndex: 'total',
      key: 'total',
      width: 120,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openDetail(row, 'all')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: '未开始',
      dataIndex: 'todo',
      key: 'todo',
      width: 100,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openDetail(row, 'todo')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: '进行中',
      dataIndex: 'doing',
      key: 'doing',
      width: 100,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openDetail(row, 'doing')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: '延期未完成',
      dataIndex: 'delayTodo',
      key: 'delayTodo',
      width: 130,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openDetail(row, 'delayTodo')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: '延期已完成',
      dataIndex: 'delayDone',
      key: 'delayDone',
      width: 120,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openDetail(row, 'delayDone')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: '延期率',
      dataIndex: 'delayRate',
      key: 'delayRate',
      width: 180,
      render: (value: number) => (
        <div className="wt-reports__progress-cell">
          <Progress percent={value} showInfo={false} size="small" strokeColor="#52c41a" trailColor="#f0f0f0" />
          <span>{value}%</span>
        </div>
      )
    }
  ]

  const columns = activeReportTab === 'delay' ? delayColumns : progressColumns

  const openMemberDetail = (row: MemberReportRow, filter: DetailFilter) => {
    const memberTasks = rows.flatMap(r => r.tasks).filter(t => (t.owner ?? '').trim() === row.member)
    setDetailRow({
      key: `member:${row.member}`,
      projectName: `${row.member} 的任务`,
      projectStatus: '-',
      total: row.total,
      todo: row.todo,
      doing: row.doing,
      done: row.done,
      percent: row.percent,
      overdue: false,
      delayTodo: 0,
      delayDone: 0,
      delayRate: 0,
      tasks: memberTasks
    })
    setDetailFilter(filter)
    setDetailOpen(true)
  }

  const memberColumns: ColumnsType<MemberReportRow> = [
    { title: '成员', dataIndex: 'member', key: 'member', width: 260 },
    {
      title: activeReportTab === 'delay' ? '延期任务' : '总任务',
      dataIndex: 'total',
      key: 'total',
      width: 140,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openMemberDetail(row, 'all')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: '未开始',
      dataIndex: 'todo',
      key: 'todo',
      width: 120,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openMemberDetail(row, 'todo')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: '进行中',
      dataIndex: 'doing',
      key: 'doing',
      width: 120,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openMemberDetail(row, 'doing')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: '已完成',
      dataIndex: 'done',
      key: 'done',
      width: 120,
      align: 'center',
      render: (value: number, row) => (value > 0 ? <Typography.Link onClick={() => openMemberDetail(row, 'done')}>{value}</Typography.Link> : <span>{value}</span>)
    },
    {
      title: activeReportTab === 'delay' ? '延期完成率' : '完成率',
      dataIndex: 'percent',
      key: 'percent',
      width: 220,
      render: (value: number) => (
        <div className="wt-reports__progress-cell">
          <Progress percent={value} showInfo={false} size="small" strokeColor="#52c41a" trailColor="#f0f0f0" />
          <span>{value}%</span>
        </div>
      )
    }
  ]

  const detailTasks = useMemo(() => {
    const base = (detailRow?.tasks ?? []).map(task => ({ ...task, children: undefined }))
    if (detailFilter === 'all') return base
    if (detailFilter === 'todo') return base.filter(task => isTodo(task.status))
    if (detailFilter === 'doing') return base.filter(task => isDoing(task.status))
    if (detailFilter === 'done') return base.filter(task => isDone(task.status))
    if (detailFilter === 'delayTodo') return base.filter(task => isDelayedTask(task) && !isDone(task.status))
    if (detailFilter === 'delayDone') return base.filter(task => isDelayedTask(task) && isDone(task.status))
    return base
  }, [detailFilter, detailRow])
  const selectedProject = useMemo((): ProjectSummary | null => {
    const pid = selectedTask?.projectId ?? (detailRow && !String(detailRow.key).startsWith('member:') ? detailRow.key : null)
    if (!pid) return null
    const fromList = projectList.find(p => p.id === pid)
    if (fromList) return fromList
    const title = rows.find(r => r.key === pid)?.projectName ?? detailRow?.projectName ?? '项目'
    return {
      id: pid,
      title,
      cover: 'gradient',
      templateId: defaultProjectTemplateId
    }
  }, [detailRow, projectList, selectedTask, rows])

  const detailColumns: ColumnsType<TaskRecordLite> = [
    {
      title: '编号',
      dataIndex: 'key',
      key: 'taskId',
      width: 220,
      render: (id?: string) =>
        id ? (
          <Typography.Text className="wt-reports-detail__seq" ellipsis={{ tooltip: true }}>
            {id}
          </Typography.Text>
        ) : (
          '—'
        )
    },
    {
      title: '任务类型',
      dataIndex: 'kind',
      key: 'kind',
      width: 120,
      render: (_: unknown, r: TaskRecordLite) => <span className="wt-reports-detail__type">{r.kind === 'target' ? '目标' : '项目任务'}</span>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (v?: string) => <UnifiedWorkflowStatusTag status={v} />
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 300,
      render: (v?: string) => <span className="wt-reports-detail__title">{v || '-'}</span>
    },
    {
      title: '负责人',
      dataIndex: 'owner',
      key: 'owner',
      width: 160,
      render: (v?: string) =>
        v ? (
          <span className="wt-reports-detail__owner">
            <Avatar size={18} className="wt-reports-detail__owner-avatar">
              {unifiedOwnerAvatarInitials(v)}
            </Avatar>
            <span>{v}</span>
          </span>
        ) : (
          '-'
        )
    },
    {
      title: '截止时间',
      key: 'deadline',
      width: 170,
      render: (_v, r) => <span className="wt-reports-detail__deadline">{toDeadlineText(r)}</span>
    }
  ]

  return (
    <div className="wt-reports-page">
      {/* <div className="wt-reports-page__head">
        <Typography.Title level={4} style={{ margin: 0 }}>
          统计报表
        </Typography.Title>
      </div> */}

      <Tabs
        className="wt-reports-page__tabs"
        activeKey={activeReportTab}
        onChange={key => setActiveReportTab((key as 'progress' | 'delay') ?? 'progress')}
        items={
          reportType === 'member'
            ? [
                { key: 'progress', label: '成员进度报表' },
                { key: 'delay', label: '成员延期报表' }
              ]
            : [
                { key: 'progress', label: '项目进度报表' },
                { key: 'delay', label: '项目延期报表' }
              ]
        }
      />

      <div className="wt-reports-page__summary">
        <div className="wt-reports-page__summary-item">
          <div className="wt-reports-page__summary-label">{reportType === 'member' ? '成员' : '项目'}</div>
          <div className="wt-reports-page__summary-value">{reportType === 'member' ? memberSummary.projectCount : summary.projectCount}</div>
        </div>
        <div className="wt-reports-page__summary-item">
          <div className="wt-reports-page__summary-label">总任务</div>
          <div className="wt-reports-page__summary-value">{reportType === 'member' ? memberSummary.total : summary.total}</div>
        </div>
        <div className="wt-reports-page__summary-item">
          <div className="wt-reports-page__summary-label">未开始</div>
          <div className="wt-reports-page__summary-value">{reportType === 'member' ? memberSummary.todo : summary.todo}</div>
        </div>
        <div className="wt-reports-page__summary-item">
          <div className="wt-reports-page__summary-label">进行中</div>
          <div className="wt-reports-page__summary-value wt-reports-page__summary-value--gold">{reportType === 'member' ? memberSummary.doing : summary.doing}</div>
        </div>
        <div className="wt-reports-page__summary-item">
          <div className="wt-reports-page__summary-label">{activeReportTab === 'delay' ? '延期未完成' : '已完成'}</div>
          <div className="wt-reports-page__summary-value wt-reports-page__summary-value--green">{reportType === 'member' ? memberSummary.done : summary.done}</div>
        </div>
        <div className="wt-reports-page__summary-ring">
          <Progress type="circle" percent={reportType === 'member' ? memberSummary.percent : summary.percent} size={90} strokeColor={activeReportTab === 'delay' ? '#ff4d4f' : '#36cfc9'} trailColor="#f0f0f0" />
        </div>
      </div>

      <div className="wt-reports-page__table">
        {reportTableLoading ? (
          <ReportsTableBodySkeleton columnCount={reportSkeletonColumnCount} />
        ) : reportType === 'member' ? (
          <Table key={`member-${activeReportTab}`} rowKey="key" columns={memberColumns} dataSource={activeReportTab === 'delay' ? memberDelayRows : memberRows} pagination={REPORTS_MAIN_TABLE_PAGINATION} size="small" bordered tableLayout="fixed" />
        ) : (
          <Table key={`project-${activeReportTab}`} rowKey="key" columns={columns} dataSource={rows} pagination={REPORTS_MAIN_TABLE_PAGINATION} size="small" bordered tableLayout="fixed" />
        )}
      </div>

      <Modal open={detailOpen} title={detailRow ? `${detailRow.projectName}-${DETAIL_FILTER_TITLE[detailFilter]}（共 ${detailTasks.length} 个任务）` : '任务明细'} onCancel={() => setDetailOpen(false)} footer={null} width={1280} className="wt-reports-detail-modal" closeIcon={<span>×</span>}>
        <Table
          rowKey="key"
          columns={detailColumns}
          dataSource={detailTasks}
          size="small"
          bordered
          tableLayout="fixed"
          onRow={record => ({
            className: 'wt-reports-detail__row--clickable',
            onClick: () => {
              setSelectedTask(record)
              setTaskDetailOpen(true)
            }
          })}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showQuickJumper: false,
            showTotal: total => `共 ${total} 条`
          }}
          scroll={{ y: 760 }}
        />
      </Modal>

      <Modal open={taskDetailOpen} title={null} onCancel={handleCloseTaskDetail} footer={null} width="100vw" style={{ top: 0, paddingBottom: 0, maxWidth: '100vw' }} className="wt-reports-project-detail-modal" destroyOnHidden>
        {selectedProject && selectedTask ? (
          <ProjectDetailPage
            project={selectedProject}
            activeTab={selectedTask.kind === 'target' ? '目标管理' : '任务管理'}
            detailFromExternal={{
              kind: selectedTask.kind === 'target' ? 'target' : 'task',
              key: selectedTask.key
            }}
            onExternalDetailClose={handleCloseTaskDetail}
          />
        ) : null}
      </Modal>
    </div>
  )
}
