import {
  ApartmentOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  FolderOpenOutlined,
  MailOutlined,
  PhoneOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Alert, Avatar, Card, Empty, Input, Spin, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ensureDepartmentsContainMembers, loadOrgDepartments, loadOrgMembers } from '../../entities/org/lib/contactsStore'
import { useAccountStore } from '../../entities/account/model/useAccountStore'
import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { useOrgStore } from '../../entities/org/model/useOrgStore'
import { useHasSystemAdminOrAbove } from '../../entities/permission/systemPermissions'
import { ContactImDrawer } from '../../features/contacts-im/ContactImDrawer'
import { requestInboundUnreadSync } from '../../features/contacts-im/imSocketClient'
import { tryRequestImNotificationPermission } from '../../features/contacts-im/imDesktopNotification'
import { useContactImUnreadStore } from '../../features/contacts-im/contactImUnreadStore'
import { useContactSocketPresenceStore } from '../../features/contacts-im/contactSocketPresenceStore'
import { ContactsMemberRow } from '../../features/contacts-im/ContactsMemberRow'
import { UnifiedWorkflowStatusTag } from '../../shared/ui/unifiedWorkflowStatusTag'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { fetchContactMemberTasks, type ContactMemberTaskItemDTO } from '../../shared/api/contactsMemberTasksApi'
import type { ProjectSummary } from '../../entities/project/model/types'

type ContactUser = ReturnType<typeof loadOrgMembers>[number]
type DepartmentNode = ReturnType<typeof loadOrgDepartments>[number]

type TaskRecordLite = {
  key: string
  kind: 'stage' | 'task' | 'subtask'
  title: string
  status?: string
  owner?: string
  /** 与项目成员 key / 通讯录 id 等对齐，优先于纯文案 owner */
  ownerUserId?: string | null
  end?: string
  endDate?: string
  dueAt?: string
  overdue?: string
  children?: TaskRecordLite[]
}

type ContactTaskRow = {
  id: string
  /** 原始工作流状态，与 UnifiedWorkflowStatusTag / 工作台一致 */
  workflowStatus: string
  title: string
  project: string
  /** 截止时间展示文案（标签内，不含「截止时间:」前缀） */
  dueDisplay: string | null
  delayed: boolean
}

type ContactsPageProps = {
  projectList: ProjectSummary[]
}

const isDone = (status?: string) => status === '已完成' || status === '关闭'

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

const toDeadlineDisplay = (task: TaskRecordLite) => {
  const raw = task.end ?? task.endDate ?? task.dueAt ?? task.overdue
  if (!raw) return null
  const d = dayjs(raw)
  if (d.isValid()) return d.format('YYYY年M月D日 HH:mm')
  return String(raw)
}

const sortByLetter = (list: ContactUser[]) =>
  [...list].sort((a, b) => {
    if (a.letter === b.letter) return a.name.localeCompare(b.name)
    return a.letter.localeCompare(b.letter)
  })

function mapBackendMemberTasksToSummary(items: ContactMemberTaskItemDTO[]): {
  rows: ContactTaskRow[]
  completed: number
  pending: number
  delayed: number
} {
  const rows: ContactTaskRow[] = []
  for (const it of items) {
    if (isDone(it.status)) continue
    const kind: TaskRecordLite['kind'] = it.kind === 'subtask' ? 'subtask' : it.kind === 'target' ? 'task' : 'task'
    const task: TaskRecordLite = {
      key: it.itemKey,
      kind,
      title: it.title,
      status: it.status,
      end: it.end || undefined,
    }
    const workflowStatus = (it.status ?? '').trim() || '未开始'
    const delayed = !isDone(it.status) && isDelayedTask(task)
    const dueLine = toDeadlineDisplay(task)
    rows.push({
      id: `${it.projectId}-${it.itemKey}`,
      workflowStatus,
      title: it.title,
      project: it.projectTitle,
      dueDisplay: dueLine,
      delayed,
    })
  }
  rows.sort((a, b) => {
    const da = a.dueDisplay ?? ''
    const db = b.dueDisplay ?? ''
    return da.localeCompare(db)
  })
  const completed = items.filter(it => isDone(it.status)).length
  const pending = rows.length
  const delayed = rows.filter(r => r.delayed).length
  return { rows, completed, pending, delayed }
}

export function ContactsPage(_props: ContactsPageProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const authedUserId = useAuthStore(s => s.authedUserId)
  const accountDisplayName = useAccountStore(s => s.profile.name?.trim() ?? '')
  const contacts = useOrgStore(s => s.members) as ContactUser[]
  const departments = useOrgStore(s => s.departments) as DepartmentNode[]
  const departmentTree = useMemo(() => ensureDepartmentsContainMembers(contacts, departments), [contacts, departments])
  const initialOpen = useMemo(() => departmentTree.flatMap(node => [node.id, ...(node.children ?? []).map(item => item.id)]), [departmentTree])
  const [viewMode, setViewMode] = useState<'people' | 'department'>('people')
  const [keyword, setKeyword] = useState('')
  const [activeUserId, setActiveUserId] = useState(contacts[0]?.id ?? '')
  const [openDepartmentIds, setOpenDepartmentIds] = useState<string[]>(initialOpen)
  /** 每次进入通讯录路由时重置为「当前账号」（在成员列表中则选中并滚动可见） */
  const contactsLandingKeyRef = useRef<string | null>(null)
  const leftMemberScrollRef = useRef<HTMLDivElement>(null)
  const [backendMemberTasks, setBackendMemberTasks] = useState<ContactMemberTaskItemDTO[]>([])
  const [backendTasksLoading, setBackendTasksLoading] = useState(false)
  const [backendTasksError, setBackendTasksError] = useState<string | null>(null)
  const socketOnline = useContactSocketPresenceStore(s => s.socketOnline)
  const imUnreadCounts = useContactImUnreadStore(s => s.counts)
  const [imOpen, setImOpen] = useState(false)
  const [imPeer, setImPeer] = useState<ContactUser | null>(null)

  const userMap = useMemo(() => new Map(contacts.map(item => [item.id, item])), [contacts])
  const currentUser = userMap.get(activeUserId) ?? contacts[0]

  /** 管理员及以上可看任意成员；普通成员仅可看自己在各项目中的任务 */
  const isSystemAdminOrAbove = useHasSystemAdminOrAbove()
  const canViewMemberTasks = isSystemAdminOrAbove || (Boolean(authedUserId) && currentUser?.id === authedUserId)

  const openImWith = useCallback((u: ContactUser) => {
    setImPeer(u)
    setImOpen(true)
  }, [])

  /** 从头部「消息」等入口跳转：#/contacts?imPeerId=xxx */
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const peerId = q.get('imPeerId')?.trim()
    if (!peerId) return
    if (!contacts.length) return
    const u = contacts.find(c => c.id === peerId)
    if (u) {
      setImPeer(u)
      setImOpen(true)
    }
    navigate({ pathname: '/contacts', search: '' }, { replace: true })
  }, [location.search, contacts, navigate])

  useEffect(() => {
    useContactImUnreadStore.getState().hydrate()
  }, [])

  /** 离线期间入库的消息不会走 Socket，进入通讯录时拉近期发给我的记录补徽标 */
  useEffect(() => {
    if (!isBackendAuthEnabled() || !authedUserId) return
    if (!location.pathname.startsWith('/contacts')) return
    void requestInboundUnreadSync()
  }, [location.pathname, location.key, authedUserId])

  /** 进入通讯录时可顺带请求桌面通知权限（需用户手势，部分浏览器才弹窗） */
  useEffect(() => {
    if (!isBackendAuthEnabled() || !authedUserId) return
    if (!location.pathname.startsWith('/contacts')) return
    tryRequestImNotificationPermission()
  }, [location.pathname, authedUserId])

  useLayoutEffect(() => {
    if (!location.pathname.startsWith('/contacts')) {
      contactsLandingKeyRef.current = null
      return
    }
    if (!contacts.length) return
    const landKey = `${location.pathname}:${location.key}:${authedUserId ?? ''}`
    if (contactsLandingKeyRef.current === landKey) return
    contactsLandingKeyRef.current = landKey
    const pick =
      authedUserId && contacts.some(c => c.id === authedUserId) ? authedUserId : (contacts[0]?.id ?? '')
    if (pick) setActiveUserId(pick)
  }, [location.pathname, location.key, authedUserId, contacts])

  useEffect(() => {
    if (!isBackendAuthEnabled() || !canViewMemberTasks || !currentUser?.id) {
      setBackendMemberTasks([])
      setBackendTasksLoading(false)
      setBackendTasksError(null)
      return
    }
    const ac = new AbortController()
    setBackendTasksLoading(true)
    setBackendTasksError(null)
    setBackendMemberTasks([])
    void fetchContactMemberTasks(currentUser.id, { signal: ac.signal })
      .then(res => {
        if (ac.signal.aborted) return
        setBackendTasksLoading(false)
        if (res.ok) {
          setBackendMemberTasks(res.data)
          return
        }
        setBackendMemberTasks([])
        setBackendTasksError(res.message)
      })
      .catch(err => {
        if (ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
        setBackendTasksLoading(false)
        setBackendMemberTasks([])
        setBackendTasksError(err instanceof Error ? err.message : '任务数据加载失败')
      })
    return () => ac.abort()
  }, [canViewMemberTasks, currentUser?.id])

  const filteredContacts = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return sortByLetter(contacts)
    return sortByLetter(
      contacts.filter(
        user =>
          user.name.toLowerCase().includes(q) ||
          user.department.toLowerCase().includes(q) ||
          (user.role ?? '').toLowerCase().includes(q)
      )
    )
  }, [contacts, keyword])

  const groupedContacts = useMemo(() => {
    return filteredContacts.reduce<Record<string, ContactUser[]>>((acc, user) => {
      const key = user.letter.toUpperCase()
      if (!acc[key]) acc[key] = []
      acc[key].push(user)
      return acc
    }, {})
  }, [filteredContacts])

  const groupLetters = useMemo(() => Object.keys(groupedContacts).sort((a, b) => a.localeCompare(b)), [groupedContacts])

  useLayoutEffect(() => {
    if (!activeUserId || !leftMemberScrollRef.current) return
    const el = leftMemberScrollRef.current.querySelector('.wt-contacts-page__member--active')
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeUserId, viewMode])

  const taskSummary = useMemo(() => {
    if (!canViewMemberTasks || !currentUser) return { rows: [] as ContactTaskRow[], completed: 0, pending: 0, delayed: 0 }
    return mapBackendMemberTasksToSummary(backendMemberTasks)
  }, [backendMemberTasks, canViewMemberTasks, currentUser])

  /** 后端加载中或失败时不展示数字，避免短暂显示全 0 误导 */
  const showContactTaskStats = canViewMemberTasks && !backendTasksLoading && !backendTasksError

  const toggleOpen = (id: string) => {
    setOpenDepartmentIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]))
  }

  const renderDepartmentNode = (node: DepartmentNode, depth = 0) => {
    const isOpen = openDepartmentIds.includes(node.id)
    const members = (node.memberIds ?? [])
      .map(id => userMap.get(id))
      .filter((item): item is ContactUser => Boolean(item))
      .filter(user => user.name.toLowerCase().includes(keyword.trim().toLowerCase()) || !keyword.trim())
    const hasChild = Boolean(node.children?.length || members.length)

    return (
      <div key={node.id} className="wt-contacts-page__dept-node">
        <button type="button" className="wt-contacts-page__dept-row" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => hasChild && toggleOpen(node.id)}>
          <span className="wt-contacts-page__dept-arrow">{hasChild ? isOpen ? <CaretDownOutlined /> : <CaretRightOutlined /> : null}</span>
          <span>{node.name}</span>
        </button>

        {isOpen ? (
          <div>
            {(node.children ?? []).map(child => renderDepartmentNode(child, depth + 1))}
            {members.map(user => (
              <ContactsMemberRow
                key={user.id}
                user={user}
                active={activeUserId === user.id}
                online={Boolean(socketOnline[user.id])}
                imUnreadCount={imUnreadCounts[user.id] ?? 0}
                showChat={Boolean(authedUserId && user.id !== authedUserId)}
                onSelect={() => setActiveUserId(user.id)}
                onOpenChat={openImWith}
                style={{ paddingLeft: 26 + depth * 14 }}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const emailText = currentUser?.email?.trim()
  const phoneText = currentUser?.phone?.trim()

  return (
    <div className="wt-contacts-page">
      <aside className="wt-contacts-page__left">
        <div className="wt-contacts-page__left-title">通讯录</div>
        <Input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索" prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} className="wt-contacts-page__search" />

        <div className="wt-contacts-page__mode-tabs">
          <button type="button" className={viewMode === 'people' ? 'wt-contacts-page__mode-tab wt-contacts-page__mode-tab--active' : 'wt-contacts-page__mode-tab'} onClick={() => setViewMode('people')}>
            <TeamOutlined />
          </button>
          <button type="button" className={viewMode === 'department' ? 'wt-contacts-page__mode-tab wt-contacts-page__mode-tab--active' : 'wt-contacts-page__mode-tab'} onClick={() => setViewMode('department')}>
            <ApartmentOutlined />
          </button>
        </div>

        <div className="wt-contacts-page__left-scroll" ref={leftMemberScrollRef}>
          {viewMode === 'people' ? (
            <div className="wt-contacts-page__member-list">
              {groupLetters.map(letter => (
                <div key={letter} className="wt-contacts-page__letter-group">
                  <div className="wt-contacts-page__letter-title">{letter}</div>
                  {groupedContacts[letter].map(user => (
                    <ContactsMemberRow
                      key={user.id}
                      user={user}
                      active={activeUserId === user.id}
                      online={Boolean(socketOnline[user.id])}
                      imUnreadCount={imUnreadCounts[user.id] ?? 0}
                      showChat={Boolean(authedUserId && user.id !== authedUserId)}
                      onSelect={() => setActiveUserId(user.id)}
                      onOpenChat={openImWith}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="wt-contacts-page__department-tree">{departmentTree.map(node => renderDepartmentNode(node))}</div>
          )}
        </div>
      </aside>

      <section className="wt-contacts-page__profile">
        <div className="wt-contacts-page__banner" />
        <div className="wt-contacts-page__profile-main">
          <Avatar size={68} style={{ background: currentUser?.avatarColor ?? '#f58aa8' }}>
            {currentUser?.avatarText ?? 'DA'}
          </Avatar>
          <div className="wt-contacts-page__profile-text">
            <Typography.Title level={4} style={{ margin: 0 }}>
              {currentUser?.name}
            </Typography.Title>
            <div className="wt-contacts-page__profile-meta">
              <Typography.Text type="secondary" className="wt-contacts-page__profile-dept">
                {currentUser?.department}
              </Typography.Text>
              {emailText ? (
                <span className="wt-contacts-page__profile-meta-item">
                  <MailOutlined className="wt-contacts-page__profile-meta-icon" />
                  <Typography.Text>{emailText}</Typography.Text>
                </span>
              ) : null}
              {phoneText ? (
                <span className="wt-contacts-page__profile-meta-item">
                  <PhoneOutlined className="wt-contacts-page__profile-meta-icon" />
                  <Typography.Text>{phoneText}</Typography.Text>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <main className="wt-contacts-page__main">
        <section className="wt-contacts-page__tasks">
          <div className="wt-contacts-page__tasks-title">{currentUser?.name}的任务</div>
          {!canViewMemberTasks ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} style={{ marginTop: 24 }} />
          ) : isBackendAuthEnabled() && backendTasksError ? (
            <Alert type="error" showIcon message="任务加载失败" description={backendTasksError} style={{ marginTop: 12 }} />
          ) : isBackendAuthEnabled() && backendTasksLoading ? (
            <div style={{ marginTop: 48, textAlign: 'center' }}>
              <Spin />
            </div>
          ) : taskSummary.rows.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务数据" style={{ marginTop: 24 }} />
          ) : (
            <div className="wt-contacts-page__tasks-table">
              <div className="wt-contacts-page__tasks-body">
                {taskSummary.rows.map(task => (
                  <div key={task.id} className="wt-contacts-page__task-grid-row">
                    <div className="wt-contacts-page__task-col wt-contacts-page__task-col--title">
                      <Typography.Text ellipsis={{ tooltip: task.title }}>{task.title}</Typography.Text>
                    </div>
                    <div className="wt-contacts-page__task-col wt-contacts-page__task-col--status">
                      <UnifiedWorkflowStatusTag status={task.workflowStatus} />
                    </div>
                    <div className="wt-contacts-page__task-col wt-contacts-page__task-col--due">
                      <Tag
                        bordered={false}
                        className={task.delayed ? 'wt-contacts-page__due-tag wt-contacts-page__due-tag--delayed' : 'wt-contacts-page__due-tag'}
                        style={
                          task.delayed
                            ? { color: '#ff4d4f', background: 'rgba(255, 77, 79, 0.06)', borderColor: 'transparent' }
                            : undefined
                        }
                      >
                        {task.dueDisplay ?? '—'}
                      </Tag>
                    </div>
                    <div className="wt-contacts-page__task-col wt-contacts-page__task-col--project">
                      <FolderOpenOutlined className="wt-contacts-page__task-project-icon" />
                      <Typography.Text type="secondary" ellipsis={{ tooltip: task.project }}>
                        {task.project}
                      </Typography.Text>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      <aside className="wt-contacts-page__right">
        <Card variant="borderless" className="wt-contacts-page__stat-card">
          <div className="wt-contacts-page__stats">
            <div>
              <div className="wt-contacts-page__stat-number">{showContactTaskStats ? taskSummary.completed : '—'}</div>
              <Typography.Text type="secondary">已完成</Typography.Text>
            </div>
            <div>
              <div className="wt-contacts-page__stat-number">{showContactTaskStats ? taskSummary.pending : '—'}</div>
              <Typography.Text type="secondary">待完成</Typography.Text>
            </div>
            <div>
              <div className={`wt-contacts-page__stat-number${showContactTaskStats && taskSummary.delayed > 0 ? ' wt-contacts-page__stat-number--danger' : ''}`}>
                {showContactTaskStats ? taskSummary.delayed : '—'}
              </div>
              <Typography.Text type="secondary">延期</Typography.Text>
            </div>
          </div>
        </Card>

        <Card title="今日日程" size="small" className="wt-contacts-page__right-card">
          <div className="wt-contacts-page__empty">暂无日程</div>
        </Card>
      </aside>

      <ContactImDrawer open={imOpen} onClose={() => setImOpen(false)} peer={imPeer} selfName={accountDisplayName || '我'} />
    </div>
  )
}
