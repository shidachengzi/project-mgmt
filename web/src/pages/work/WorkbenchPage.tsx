import { CalendarOutlined, FileDoneOutlined, FolderOpenOutlined, MoreOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Card, DatePicker, Empty, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isBackendPersonalDeskProjectId, PERSONAL_DESK_PROJECT_ID } from '../../entities/project/lib/personalDesk'
import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { useBackendDataStore } from '../../entities/workspace/model/backendDataStore'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { calendarEventDtoToScheduleItem, fetchCalendarEvents } from '../../shared/api/calendarApi'
import { fetchMyTasks, type MyTaskItemDTO } from '../../shared/api/myTasksApi'
import { UNIFIED_OWNER_AVATAR_CLASS, UnifiedWorkflowStatusTag, unifiedOwnerAvatarInitials } from '../../shared/ui/unifiedWorkflowStatusTag'
import { uiTaskDateToIso } from '../../features/project-detail/tasks/projectTaskAdapter'
import type { ProjectSummary } from '../../entities/project/model/types'
import {
  WorkbenchPageSkeleton,
  WorkbenchProjectsListSkeleton,
  WorkbenchScheduleRowsSkeleton,
  WorkbenchTasksListSkeleton
} from './WorkbenchSkeleton'

type WorkbenchPageProps = {
  projectList: ProjectSummary[]
}

type ParticipatingProjectRow = {
  id: string
  name: string
  owner: string
  status: string
  due: string
}

type ResponsibleTaskRow = {
  id: string
  title: string
  status: string
  due: string
  ownerName: string
  project: string
  projectId: string
  itemKey: string
}

type ScheduleItem = {
  id: string
  title: string
  date: string
  time: string
  ownerId?: string
}

const toMmDd = (value?: string) => {
  if (!value) return '-'
  const trimmed = String(value).trim()
  const md = trimmed.match(/^(\d{1,2})月(\d{1,2})日$/)
  if (md) return `${Number(md[1])}月${Number(md[2])}日`
  const d = dayjs(trimmed, 'YYYY-MM-DD', true).isValid() ? dayjs(trimmed, 'YYYY-MM-DD', true) : dayjs(trimmed)
  if (!d.isValid()) return '-'
  return d.year() === dayjs().year() ? `${d.month() + 1}月${d.date()}日` : `${d.year()}年${d.month() + 1}月${d.date()}日`
}

const dueSortKey = (due: string) => {
  if (due === '-') return Number.MAX_SAFE_INTEGER
  const iso = dayjs(due, 'YYYY-MM-DD', true)
  if (iso.isValid()) return iso.valueOf()
  const m = due.match(/^(\d{1,2})月(\d{1,2})日$/)
  if (m) return dayjs().year() * 10000 + Number(m[1]) * 100 + Number(m[2])
  const y = due.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  if (y) return Number(y[1]) * 10000 + Number(y[2]) * 100 + Number(y[3])
  const loose = dayjs(due)
  return loose.isValid() ? loose.valueOf() : Number.MAX_SAFE_INTEGER
}

const formatTaskItemIdForDisplay = (itemKey: string) => {
  if (itemKey.length <= 16) return itemKey
  return `${itemKey.slice(0, 8)}…${itemKey.slice(-6)}`
}

/** 截止时间完整展示：优先 YYYY-MM-DD，其次解析中文/月日后统一格式 */
function formatDueDisplayFull(value?: string | null): string {
  if (value == null || value === '' || value === '-') return '-'
  const t = String(value).trim()
  if (!t) return '-'
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = dayjs(t, 'YYYY-MM-DD', true)
    return d.isValid() ? d.format('YYYY-MM-DD') : '-'
  }
  const iso = uiTaskDateToIso(t)
  if (iso) {
    const d = dayjs(iso, 'YYYY-MM-DD', true)
    return d.isValid() ? d.format('YYYY-MM-DD') : toMmDd(t)
  }
  const d = dayjs(t, 'YYYY-MM-DD', true)
  if (d.isValid()) return d.format('YYYY-MM-DD')
  const loose = dayjs(t)
  return loose.isValid() ? loose.format('YYYY-MM-DD') : toMmDd(t)
}

function myTaskEndDisplay(dto: MyTaskItemDTO): string {
  return formatDueDisplayFull(dto.end)
}

/** 与主导航项目色点同思路，用于工作台任务行图标点缀 */
const WORKBENCH_ACCENT_COLORS = ['#5b8ff9', '#61d6a7', '#f6bd16', '#7262fd'] as const

function workbenchAccentColorForKey(key: string): string {
  let h = 0
  const s = String(key ?? '')
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return WORKBENCH_ACCENT_COLORS[Math.abs(h) % WORKBENCH_ACCENT_COLORS.length]
}

/** 工作台默认不展示已结束的项目/任务（与「我的任务」看板一致） */
const isWorkbenchTerminalStatus = (status?: string) => {
  const s = (status ?? '').trim()
  return s === '已完成' || s === '关闭'
}

export function WorkbenchPage({ projectList }: WorkbenchPageProps) {
  const navigate = useNavigate()
  const authedUserId = useAuthStore(s => s.authedUserId)
  const [storageTick, setStorageTick] = useState(0)
  const [backendScheduleItems, setBackendScheduleItems] = useState<ScheduleItem[] | null>(null)
  const [scheduleDate, setScheduleDate] = useState<Dayjs>(() => dayjs().startOf('day'))
  const workspaceOverviewLiteByProject = useBackendDataStore(s => s.workspaceOverviewLiteByProject)
  const projectsLoaded = useBackendDataStore(s => s.projectsLoaded)
  const [backendResponsible, setBackendResponsible] = useState<MyTaskItemDTO[] | null>(null)
  const [backendLoadError, setBackendLoadError] = useState<string | null>(null)

  useEffect(() => {
    const handler = () => setStorageTick(v => v + 1)
    window.addEventListener('storage', handler)
    window.addEventListener('focus', handler)
    window.addEventListener('pm-calendar-updated', handler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('focus', handler)
      window.removeEventListener('pm-calendar-updated', handler)
    }
  }, [])

  useEffect(() => {
    if (!isBackendAuthEnabled() || !authedUserId) {
      setBackendResponsible(null)
      setBackendLoadError(null)
      return
    }
    let cancelled = false
    setBackendLoadError(null)
    void (async () => {
      const res = await fetchMyTasks('responsible')
      if (cancelled) return
      if (!res.ok) {
        setBackendLoadError(res.message)
        setBackendResponsible([])
        return
      }
      setBackendResponsible(res.data)
    })()
    return () => {
      cancelled = true
    }
  }, [authedUserId, storageTick])

  useEffect(() => {
    if (!isBackendAuthEnabled() || !authedUserId) {
      setBackendScheduleItems(null)
      return
    }
    let cancelled = false
    const d = scheduleDate.format('YYYY-MM-DD')
    void (async () => {
      const res = await fetchCalendarEvents({ from: d, to: d })
      if (cancelled) return
      if (!res.ok) {
        setBackendScheduleItems([])
        return
      }
      setBackendScheduleItems(res.data.map(calendarEventDtoToScheduleItem))
    })()
    return () => {
      cancelled = true
    }
  }, [authedUserId, scheduleDate, storageTick])

  const participatingProjects = useMemo<ParticipatingProjectRow[]>(() => {
    return projectList
      .filter(p => !isBackendPersonalDeskProjectId(p.id) && p.id !== PERSONAL_DESK_PROJECT_ID)
      .map(project => {
        const lite = workspaceOverviewLiteByProject[project.id]
        const endYmd = lite?.endDate?.trim()
        const due = endYmd ? formatDueDisplayFull(endYmd) : '-'
        const status = (lite?.progressStatus || project.backendProgressStatus || '').trim() || '-'
        return {
          id: project.id,
          name: project.title,
          owner: lite?.owner?.trim() || '—',
          status,
          due
        }
      })
      .filter(row => !isWorkbenchTerminalStatus(row.status))
      .sort((a, b) => dueSortKey(a.due) - dueSortKey(b.due))
  }, [projectList, workspaceOverviewLiteByProject])

  const responsibleTasks = useMemo<ResponsibleTaskRow[]>(() => {
    if (!backendResponsible) return []
    return backendResponsible
      .filter(item => item.kind === 'task')
      .filter(item => !isWorkbenchTerminalStatus(item.status))
      .map(item => ({
        id: formatTaskItemIdForDisplay(item.itemKey),
        title: item.title,
        status: item.status ?? '未开始',
        due: myTaskEndDisplay(item),
        ownerName: item.ownerName?.trim() || '—',
        project: isBackendPersonalDeskProjectId(item.projectId) || item.projectId === PERSONAL_DESK_PROJECT_ID ? '个人任务' : item.projectTitle?.trim() || projectList.find(p => p.id === item.projectId)?.title || '—',
        projectId: item.projectId,
        itemKey: item.itemKey
      }))
  }, [projectList, backendResponsible])

  const scheduleItems = useMemo<ScheduleItem[]>(() => backendScheduleItems ?? [], [backendScheduleItems])

  const visibleSchedules = useMemo(() => {
    const key = scheduleDate.format('YYYY-MM-DD')
    const dayRows = scheduleItems.filter(item => item.date === key)
    return dayRows
  }, [authedUserId, scheduleDate, scheduleItems])

  const tasksLoading = isBackendAuthEnabled() && Boolean(authedUserId) && backendResponsible === null
  const scheduleLoading = isBackendAuthEnabled() && Boolean(authedUserId) && backendScheduleItems === null
  const projectsLoading = isBackendAuthEnabled() && Boolean(authedUserId) && !projectsLoaded
  /** 首屏尚无项目列表且任务未返回时，整页骨架避免白屏 */
  const showFullPageSkeleton = projectsLoading || (tasksLoading && projectList.length === 0)

  if (isBackendAuthEnabled() && !authedUserId) {
    return (
      <div className="wt-workbench">
        <div className="wt-workbench__topbar">
          <Typography.Text className="wt-workbench__view">默认视图</Typography.Text>
        </div>
        <Empty style={{ marginTop: 48 }} description="请先登录后查看工作台" />
      </div>
    )
  }

  return (
    <div className="wt-workbench">
      {/* <div className="wt-workbench__topbar">
        <Typography.Text className="wt-workbench__view">默认视图</Typography.Text>
      </div> */}

      <div className="wt-workbench__main">
        {backendLoadError ? (
          <Typography.Text type="danger" style={{ display: 'block', marginBottom: 8, flexShrink: 0 }}>
            我负责的任务加载失败：{backendLoadError}
          </Typography.Text>
        ) : null}

        {showFullPageSkeleton ? (
          <WorkbenchPageSkeleton />
        ) : (
          <div className="wt-workbench__grid wt-workbench__grid--custom">
            <Card className="wt-workbench__panel" title="我参与的项目" extra={<Typography.Text type="secondary">{participatingProjects.length} 个项目</Typography.Text>}>
              <div className="wt-workbench__list wt-workbench__list--projects">
                {projectsLoading ? (
                  <WorkbenchProjectsListSkeleton />
                ) : participatingProjects.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无项目" />
                ) : (
                  participatingProjects.map(item => (
                    <div
                      className="wt-workbench__row wt-workbench__row--project wt-workbench__row--clickable"
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/projects/${item.id}/overview`)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigate(`/projects/${item.id}/overview`)
                        }
                      }}
                    >
                      <div className="wt-workbench__name">
                        <FolderOpenOutlined className="wt-workbench__name-icon" style={{ color: workbenchAccentColorForKey(item.id) }} />
                        <span>{item.name}</span>
                      </div>
                      <div className="wt-workbench__meta-col wt-workbench__meta-col--owner">
                        <Avatar size={22} className={`${UNIFIED_OWNER_AVATAR_CLASS}${item.owner && item.owner !== '—' ? '' : ' wt-reports-detail__owner-avatar--empty'}`}>
                          {item.owner && item.owner !== '—' ? unifiedOwnerAvatarInitials(item.owner) : <UserOutlined />}
                        </Avatar>
                        <Typography.Text ellipsis={{ tooltip: item.owner }}>{item.owner}</Typography.Text>
                      </div>
                      <div className="wt-workbench__meta-col wt-workbench__meta-col--status">{item.status !== '-' ? <UnifiedWorkflowStatusTag status={item.status} /> : <Typography.Text>-</Typography.Text>}</div>
                      <div className="wt-workbench__meta-col wt-workbench__meta-col--due">
                        <Typography.Text className="wt-workbench__due-text">{item.due}</Typography.Text>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card
              className="wt-workbench__panel wt-workbench__panel--schedule"
              title={
                <div className="wt-workbench__schedule-head-title">
                  <span className="wt-workbench__schedule-head-title-text">我的日程</span>
                  <DatePicker size="small" value={scheduleDate} onChange={value => setScheduleDate(value ?? dayjs())} format="YYYY-MM-DD" suffixIcon={<CalendarOutlined />} allowClear={false} />
                </div>
              }
              extra={
                <div className="wt-workbench__schedule-extra">
                  <Button type="text" icon={<PlusOutlined />} onClick={() => navigate('/calendar')} />
                  <Button type="text" icon={<MoreOutlined />} />
                </div>
              }
            >
              <div className="wt-workbench__schedule-stack">
                <div className="wt-workbench__schedule-scroll">
                  {scheduleLoading ? (
                    <WorkbenchScheduleRowsSkeleton />
                  ) : visibleSchedules.length > 0 ? (
                    <div className="wt-workbench__schedule-list">
                      {visibleSchedules.map(item => (
                        <div key={item.id} className="wt-workbench__schedule-item">
                          <span className="wt-workbench__schedule-time">{item.time}</span>
                          <span className="wt-workbench__schedule-title">{item.title}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="wt-workbench__empty wt-workbench__empty--schedule">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                          <span>
                            当前日期暂无日程，点击 <Typography.Link onClick={() => navigate('/calendar')}>创建日程</Typography.Link>
                          </span>
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card
              className="wt-workbench__panel wt-workbench__panel--tasks"
              title="我负责的任务"
              extra={
                tasksLoading ? (
                  <Typography.Text type="secondary">加载中…</Typography.Text>
                ) : (
                  <Typography.Text type="secondary">共 {responsibleTasks.length} 个任务</Typography.Text>
                )
              }
            >
              <div className="wt-workbench__list wt-workbench__list--tasks">
                {tasksLoading ? (
                  <WorkbenchTasksListSkeleton />
                ) : responsibleTasks.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无负责的任务" />
                ) : (
                  responsibleTasks.map(task => (
                    <div
                      className="wt-workbench__row wt-workbench__row--task wt-workbench__row--clickable"
                      key={`${task.projectId}-${task.itemKey}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/projects/${task.projectId}/tasks?openTask=${encodeURIComponent(task.itemKey)}`)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigate(`/projects/${task.projectId}/tasks?openTask=${encodeURIComponent(task.itemKey)}`)
                        }
                      }}
                    >
                      <div className="wt-workbench__name">
                        <FileDoneOutlined className="wt-workbench__name-icon" style={{ color: workbenchAccentColorForKey(`${task.projectId}:${task.itemKey}`) }} />
                        <span>{task.title}</span>
                      </div>
                      <div className="wt-workbench__meta-col wt-workbench__meta-col--owner">
                        <Avatar size={22} className={`${UNIFIED_OWNER_AVATAR_CLASS}${task.ownerName && task.ownerName !== '—' ? '' : ' wt-reports-detail__owner-avatar--empty'}`}>
                          {task.ownerName && task.ownerName !== '—' ? unifiedOwnerAvatarInitials(task.ownerName) : <UserOutlined />}
                        </Avatar>
                        <Typography.Text ellipsis={{ tooltip: task.ownerName }} type="secondary">
                          {task.ownerName}
                        </Typography.Text>
                      </div>
                      <div className="wt-workbench__meta-col wt-workbench__meta-col--status">
                        <UnifiedWorkflowStatusTag status={task.status} />
                      </div>
                      <div className="wt-workbench__meta-col wt-workbench__meta-col--due">
                        <Typography.Text className="wt-workbench__due-text">{task.due}</Typography.Text>
                      </div>
                      <div className="wt-workbench__meta-col wt-workbench__meta-col--project">
                        <FolderOpenOutlined className="wt-workbench__meta-project-icon" style={{ color: workbenchAccentColorForKey(task.projectId) }} />
                        <Typography.Text type="secondary" ellipsis={{ tooltip: task.project }}>
                          {task.project}
                        </Typography.Text>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
