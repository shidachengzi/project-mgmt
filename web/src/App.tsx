import { useEffect, useMemo, useRef, useState } from 'react'
import { AppstoreOutlined, CalendarOutlined, CaretDownOutlined, CheckSquareFilled, FolderOpenOutlined, HomeOutlined, RightOutlined, SettingOutlined, StarOutlined, TeamOutlined } from '@ant-design/icons'
import { App as AntApp, Breadcrumb, Spin, Typography } from 'antd'
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { MainLayout } from './layouts/MainLayout'
import { AllProjectsPage } from './pages/projects'
import type { ProjectSummary } from './entities/project/model/types'
import { ProjectDetailFeature } from './features/project-detail/ProjectDetailFeature'
import { AdminConsoleFeature } from './features/admin-console/AdminConsoleFeature'
import { MyTasksPage, WorkbenchPage, ReportsPage } from './pages/work'
import { CalendarPage, CalendarSettingsAdvanced, CalendarSettingsBasic, CalendarSettingsLayout, CalendarSettingsMembers, CalendarSettingsPlaceholder, CalendarSettingsReminders } from './pages/calendar'
import { ContactsPage } from './pages/contacts'
import { defaultProjectTemplateId, getProjectTemplateConfig } from './entities/project/config/projectTemplates'
import { clearProjectScopedStorage } from './entities/project/lib/projectStorage'
import { AccountSettingsPage } from './pages/account'
import { ForgotPasswordPage, LoginPage } from './pages/auth'
import { useAuthStore } from './entities/auth/model/useAuthStore'
import { useProjectStore } from './entities/project/model/useProjectStore'
import { useHasSystemPermission } from './entities/permission/systemPermissions'
import { getProjectMemberRoleMap } from './entities/permission/projectPermissions'
import { isBackendPersonalDeskProjectId } from './entities/project/lib/personalDesk'
import { isBackendAuthEnabled } from './shared/api/backendClient'
import { postBackendAccessLog } from './shared/api/meAccountApi'
import { fetchProjectDetail } from './shared/api/projectsApi'
import { useBackendDataStore } from './entities/workspace/model/backendDataStore'
import { AppProviders } from './app/providers/AppProviders'
import { useAppBootstrap } from './app/hooks/useAppBootstrap'
import { BackendRequiredGate } from './app/components/BackendRequiredGate'
import './app/styles/importGlobalStyles'
import {
  MY_TASK_TAB_PATHS,
  PATH_TO_MY_TASK_TAB,
  PATH_TO_PROJECT_TAB,
  PROJECT_TAB_PATHS,
  type MyTaskTab,
} from './app/routes/constants'

type RouteProjectDetailProps = {
  projectList: ProjectSummary[]
  setProjectList: React.Dispatch<React.SetStateAction<ProjectSummary[]>>
  isProjectListHydrated: boolean
}

function RouteShell({ projectList, setProjectList, isProjectListHydrated }: RouteProjectDetailProps) {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const authedUserId = useAuthStore(s => s.authedUserId)
  const memberRoleMaps = useBackendDataStore(s => s.memberRoleMapByProject)
  const projectMatch = useMatch('/projects/:projectId/:tab?')
  const myTasksMatch = useMatch('/my-tasks/:tab?')
  const [myTasksDetailBridge, setMyTasksDetailBridge] = useState<{
    project: ProjectSummary
    kind: 'target' | 'task'
    key: string
  } | null>(null)
  const [myTasksDetailCloseToken, setMyTasksDetailCloseToken] = useState(0)

  const currentProjectId = projectMatch?.params.projectId
  const projectTab = PATH_TO_PROJECT_TAB[projectMatch?.params.tab ?? 'overview'] ?? '项目概览'
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const routeTaskDetailFromQuery = useMemo(() => {
    const openTask = queryParams.get('openTask')
    if (!openTask) return null
    return { kind: 'task' as const, key: openTask }
  }, [queryParams])

  const visibleProjectList = useMemo(() => {
    return projectList.filter(project => {
      if (isBackendPersonalDeskProjectId(project.id)) return false
      // GET /api/projects 已对当前用户做可见性过滤；成员 roleMap 异步水合，水合前为空会误判「非成员」导致卡片全部消失。
      if (project.backendVisibility === 'public') return true
      if (!authedUserId) return false
      if (project.backendVisibility === 'private') {
        const roleMap = memberRoleMaps[project.id] ?? getProjectMemberRoleMap(project.id)
        if (Object.keys(roleMap).length > 0) return Boolean(roleMap[authedUserId])
        return true
      }
      return true
    })
  }, [authedUserId, projectList, memberRoleMaps])
  const currentProject = useMemo(() => visibleProjectList.find(item => item.id === currentProjectId) ?? null, [currentProjectId, visibleProjectList])
  const [detailRouteFallback, setDetailRouteFallback] = useState<ProjectSummary | null>(null)
  const [detailRouteFallbackLoading, setDetailRouteFallbackLoading] = useState(false)
  /** 避免「详情补拉」effect 因父组件每帧传入新的 setProjectList 引用而无限触发 */
  const detailRouteFetchAttemptedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isBackendAuthEnabled() || !currentProjectId || !authedUserId) {
      detailRouteFetchAttemptedIdRef.current = null
      setDetailRouteFallback(null)
      setDetailRouteFallbackLoading(false)
      return
    }
    if (currentProject) {
      detailRouteFetchAttemptedIdRef.current = null
      setDetailRouteFallback(null)
      setDetailRouteFallbackLoading(false)
      return
    }
    if (detailRouteFetchAttemptedIdRef.current === currentProjectId) {
      return
    }
    let cancelled = false
    const fetchForId = currentProjectId
    detailRouteFetchAttemptedIdRef.current = fetchForId
    setDetailRouteFallbackLoading(true)
    setDetailRouteFallback(null)
    void (async () => {
      const res = await fetchProjectDetail(fetchForId)
      if (cancelled) return
      if (!res.ok) {
        setDetailRouteFallback(null)
        setDetailRouteFallbackLoading(false)
        return
      }
      const d = res.data
      const summary: ProjectSummary = {
        id: d.id,
        title: d.title,
        cover: d.coverKind === 'image' ? 'image' : 'gradient',
        image: d.coverImageData ?? undefined,
        templateId: defaultProjectTemplateId,
        backendVisibility: d.visibility === 'public' ? 'public' : 'private',
        backendArchived: d.archived,
        backendProgressStatus: d.progressStatus,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt
      }
      setDetailRouteFallback(summary)
      setDetailRouteFallbackLoading(false)
      const store = useProjectStore.getState()
      if (!store.projectList.some(p => p.id === summary.id) && !isBackendPersonalDeskProjectId(summary.id)) {
        store.setProjectList([summary, ...store.projectList])
      }
    })()
    return () => {
      cancelled = true
      if (detailRouteFetchAttemptedIdRef.current === fetchForId) {
        detailRouteFetchAttemptedIdRef.current = null
      }
    }
  }, [currentProjectId, currentProject, authedUserId])

  /** 后端登录：记录主应用内路由访问（用于账号设置「访问日志」） */
  useEffect(() => {
    if (!isBackendAuthEnabled() || !authedUserId) return
    const full = `${location.pathname}${location.search || ''}`
    const tid = window.setTimeout(() => {
      void postBackendAccessLog(full)
    }, 900)
    return () => clearTimeout(tid)
  }, [location.pathname, location.search, authedUserId])

  const resolvedProject = currentProject ?? detailRouteFallback
  const currentTemplate = useMemo(() => getProjectTemplateConfig(resolvedProject?.templateId), [resolvedProject?.templateId])
  const activeMyTaskTab = (PATH_TO_MY_TASK_TAB[myTasksMatch?.params.tab ?? 'responsible'] ?? '我负责的') as MyTaskTab
  const isWorkbenchRoute = location.pathname === '/workbench'
  const isCalendarRoute = location.pathname.startsWith('/calendar')
  const isCalendarSettingsRoute = location.pathname.includes('/calendar/settings/')
  const isContactsRoute = location.pathname.startsWith('/contacts')
  const isReportsRoute = location.pathname.startsWith('/reports')
  const isLoginRoute = location.pathname.startsWith('/login') || location.pathname.startsWith('/forgot-password')
  const isAccountSettingsRoute = location.pathname.startsWith('/account/settings')

  const reportsType = queryParams.get('type') === 'member' ? 'member' : 'project'
  const accountTab = (queryParams.get('tab') as 'basic' | 'profile' | 'logs') || 'basic'
  const canViewReports = useHasSystemPermission('project.report')

  const headerLeft = isReportsRoute ? (
    <div className="wt-reports-header-nav">
      <div className="wt-reports-header-nav__crumb" onClick={() => navigate('/projects')}>
        <FolderOpenOutlined />
        <RightOutlined className="wt-reports-header-nav__crumb-sep" />
        <span className="wt-reports-header-nav__title">统计报表</span>
      </div>
      <span className="wt-reports-header-nav__divider" />
      <button type="button" className={reportsType === 'project' ? 'wt-reports-header-nav__tab wt-reports-header-nav__tab--active' : 'wt-reports-header-nav__tab'} onClick={() => navigate('/reports?type=project')}>
        项目
      </button>
      <button type="button" className={reportsType === 'member' ? 'wt-reports-header-nav__tab wt-reports-header-nav__tab--active' : 'wt-reports-header-nav__tab'} onClick={() => navigate('/reports?type=member')}>
        成员
      </button>
    </div>
  ) : isAccountSettingsRoute ? (
    <div className="wt-my-tasks-header-nav">
      <div
        className="wt-my-tasks-header-nav__crumb"
        onClick={() => {
          if (window.history.length > 1) navigate(-1)
          else navigate('/projects')
        }}
      >
        <HomeOutlined />
        <RightOutlined className="wt-my-tasks-header-nav__sep" />
        <span>账号设置</span>
      </div>
      <span className="wt-my-tasks-header-nav__divider" />
      {(
        [
          { key: 'basic' as const, label: '基本设置' },
          { key: 'profile' as const, label: '个人资料' },
          { key: 'logs' as const, label: '访问日志' }
        ] as const
      ).map(t => (
        <button
          key={t.key}
          type="button"
          className={accountTab === t.key ? 'wt-my-tasks-header-nav__tab wt-my-tasks-header-nav__tab--active' : 'wt-my-tasks-header-nav__tab'}
          onClick={() => {
            const next = new URLSearchParams(location.search)
            next.set('tab', t.key)
            navigate(`${location.pathname}?${next.toString()}`, { replace: true })
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  ) : projectMatch && resolvedProject ? (
    <div className="wt-project-header-nav">
      <div className="wt-project-header-nav__crumb" onClick={() => navigate('/projects')}>
        <FolderOpenOutlined />
        <RightOutlined className="wt-project-header-nav__crumb-sep" />
        <span className="wt-project-header-nav__title">{resolvedProject.title}</span>
        <CaretDownOutlined />
      </div>
      <span className="wt-project-header-nav__icon-btn">
        <StarOutlined />
      </span>
      <span className="wt-project-header-nav__icon-btn">
        <SettingOutlined />
      </span>
      <span className="wt-project-header-nav__divider" />
      {(['项目概览', '目标管理', '任务管理', '甘特图', '更多设置'] as const).map(tab => (
        <span key={tab} className={projectTab === tab ? 'wt-project-header-nav__tab wt-project-header-nav__tab--active' : 'wt-project-header-nav__tab'} onClick={() => navigate(`/projects/${resolvedProject.id}/${PROJECT_TAB_PATHS[tab]}`)}>
          {tab === '目标管理' ? currentTemplate.targetTabLabel : tab === '任务管理' ? currentTemplate.taskTabLabel : tab}
        </span>
      ))}
    </div>
  ) : location.pathname.startsWith('/my-tasks') ? (
    <div className="wt-my-tasks-header-nav">
      <div className="wt-my-tasks-header-nav__crumb" onClick={() => navigate('/projects')}>
        <CheckSquareFilled />
        <RightOutlined className="wt-my-tasks-header-nav__sep" />
        <span>我的任务</span>
      </div>
      <span className="wt-my-tasks-header-nav__divider" />
      {(['我负责的', '我参与的', '我创建的'] as const).map(tab => (
        <button key={tab} type="button" className={activeMyTaskTab === tab ? 'wt-my-tasks-header-nav__tab wt-my-tasks-header-nav__tab--active' : 'wt-my-tasks-header-nav__tab'} onClick={() => navigate(`/my-tasks/${MY_TASK_TAB_PATHS[tab]}`)}>
          {tab}
        </button>
      ))}
    </div>
  ) : isWorkbenchRoute ? (
    <Breadcrumb
      items={[
        {
          title: (
            <Typography.Link onClick={() => navigate('/workbench')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <AppstoreOutlined />
                工作台
              </span>
            </Typography.Link>
          )
        }
      ]}
    />
  ) : isCalendarRoute ? (
    <Breadcrumb
      items={[
        {
          title: (
            <Typography.Link onClick={() => navigate('/calendar')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CalendarOutlined />
                日历
              </span>
            </Typography.Link>
          )
        },
        ...(isCalendarSettingsRoute ? [{ title: '设置' }] : [])
      ]}
    />
  ) : isContactsRoute ? (
    <Breadcrumb
      items={[
        {
          title: (
            <Typography.Link onClick={() => navigate('/contacts')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <TeamOutlined />
                通讯录
              </span>
            </Typography.Link>
          )
        }
      ]}
    />
  ) : (
    <Breadcrumb
      items={[
        {
          title: <Typography.Link onClick={() => navigate('/projects')}>项目</Typography.Link>
        },
        { title: '全部项目' }
      ]}
    />
  )

  if (!isProjectListHydrated) return null
  if (!isLoginRoute && !authedUserId) return <Navigate to="/login" replace />

  if (!isBackendAuthEnabled()) {
    return <BackendRequiredGate />
  }

  return (
    <MainLayout
      headerLeft={headerLeft}
      showSecondarySider={location.pathname === '/projects'}
      onOpenAdmin={() => navigate('/console/members')}
      onOpenAccountSettings={() => navigate('/account/settings')}
      activePrimaryNavKey={isWorkbenchRoute ? 'workbench' : isCalendarRoute ? 'calendar' : isContactsRoute ? 'contacts' : 'projects'}
      projects={visibleProjectList}
      onPrimaryNavChange={key => {
        if (key === 'workbench') navigate('/workbench')
        if (key === 'projects') navigate('/projects')
        if (key === 'calendar') navigate('/calendar')
        if (key === 'contacts') navigate('/contacts')
      }}
      activeWorkMenuKey={location.pathname.startsWith('/my-tasks') ? 'mine' : isReportsRoute ? 'reports' : location.pathname.startsWith('/projects/') ? (currentProjectId ?? 'all') : 'all'}
      activeWorkSection={location.pathname.startsWith('/projects/') ? 'projects' : 'work'}
      onWorkMenuChange={key => {
        if (key === 'mine') navigate('/my-tasks/responsible')
        if (key === 'all') navigate('/projects')
        if (key === 'reports') {
          if (!canViewReports) {
            message.warning('暂无报表查看权限')
            return
          }
          navigate('/reports')
        }
        if (visibleProjectList.some(p => p.id === key)) navigate(`/projects/${key}/overview`)
      }}
    >
      <div className="wt-route-outlet">
        <Routes>
          <Route path="/workbench" element={<WorkbenchPage projectList={visibleProjectList} />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/calendar/settings/:calendarId" element={<CalendarSettingsLayout />}>
            <Route index element={<Navigate to="members" replace />} />
            <Route path="members" element={<CalendarSettingsMembers />} />
            <Route path="reminders" element={<CalendarSettingsReminders />} />
            <Route path="sharing-events" element={<CalendarSettingsPlaceholder title="日程共享" />} />
            <Route path="sharing-calendar" element={<CalendarSettingsPlaceholder title="日历共享" />} />
            <Route path="basic" element={<CalendarSettingsBasic />} />
            <Route path="advanced" element={<CalendarSettingsAdvanced />} />
            <Route path="*" element={<Navigate to="members" replace />} />
          </Route>
          <Route path="/contacts" element={<ContactsPage projectList={projectList} />} />
          <Route path="/account/settings" element={<AccountSettingsPage />} />
          <Route path="/reports" element={canViewReports ? <ReportsPage projectList={visibleProjectList} reportType={reportsType} /> : <Navigate to="/workbench" replace />} />
          <Route
            path="/projects"
            element={
              <AllProjectsPage
                projects={visibleProjectList}
                onOpenProject={project => navigate(`/projects/${project.id}/overview`)}
                onOpenProjectSettings={project => {
                  navigate(`/projects/${project.id}/settings`)
                }}
                onCreateProject={project => {
                  setProjectList(prev => [project, ...prev])
                  navigate(`/projects/${project.id}/overview`)
                }}
                onUpdateProject={project => {
                  setProjectList(prev => prev.map(item => (item.id === project.id ? project : item)))
                }}
              />
            }
          />
          <Route
            path="/projects/:projectId/:tab?"
            element={
              resolvedProject ? (
                <ProjectDetailFeature
                  project={resolvedProject}
                  activeTab={projectTab}
                  onUpdateProject={project => setProjectList(prev => prev.map(item => (item.id === project.id ? project : item)))}
                  onDeleteProject={project => {
                    clearProjectScopedStorage(project.id)
                    setProjectList(prev => prev.filter(item => item.id !== project.id))
                    navigate('/projects')
                  }}
                  onBack={() => navigate('/projects')}
                  detailFromExternal={projectTab === '任务管理' ? routeTaskDetailFromQuery : null}
                  onExternalDetailClose={() => {
                    if (!queryParams.get('openTask')) return
                    const next = new URLSearchParams(location.search)
                    next.delete('openTask')
                    const query = next.toString()
                    navigate(`${location.pathname}${query ? `?${query}` : ''}`, { replace: true })
                  }}
                />
              ) : detailRouteFallbackLoading && currentProjectId && isBackendAuthEnabled() ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <Spin size="large" />
                </div>
              ) : (
                <Navigate to="/projects" replace />
              )
            }
          />
          <Route
            path="/my-tasks/:tab?"
            element={
              <MyTasksPage
                activeTab={activeMyTaskTab}
                projectList={projectList}
                detailCloseReloadToken={myTasksDetailCloseToken}
                onOpenItemDetail={(project, kind, key) => {
                  setMyTasksDetailBridge({ project, kind, key })
                }}
              />
            }
          />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </div>

      {myTasksDetailBridge ? (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            width: 0,
            height: 0,
            overflow: 'hidden',
            opacity: 0,
            pointerEvents: 'none',
            left: 0,
            top: 0
          }}
        >
          <ProjectDetailFeature
            key={`my-tasks-bridge-${myTasksDetailBridge.project.id}-${myTasksDetailBridge.kind}-${myTasksDetailBridge.key}`}
            project={myTasksDetailBridge.project}
            activeTab={myTasksDetailBridge.kind === 'target' ? '目标管理' : '任务管理'}
            detailFromExternal={{ kind: myTasksDetailBridge.kind, key: myTasksDetailBridge.key }}
            onExternalDetailClose={() => {
              setMyTasksDetailBridge(null)
              setMyTasksDetailCloseToken(t => t + 1)
            }}
          />
        </div>
      ) : null}
    </MainLayout>
  )
}

export default function App() {
  useAppBootstrap()

  const projectList = useProjectStore(s => s.projectList)
  const setProjectListStore = useProjectStore(s => s.setProjectList)
  const authedUserId = useAuthStore(s => s.authedUserId)
  const setProjectList: React.Dispatch<React.SetStateAction<ProjectSummary[]>> = next =>
    setProjectListStore(
      typeof next === 'function' ? (next as (prev: ProjectSummary[]) => ProjectSummary[])(projectList) : next,
    )
  const isProjectListHydrated = true

  return (
    <AppProviders>
      <Routes>
        <Route
          path="/console/*"
          element={
            !isBackendAuthEnabled() ? (
              <BackendRequiredGate />
            ) : authedUserId ? (
              <AdminConsoleFeature />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/*" element={<RouteShell projectList={projectList} setProjectList={setProjectList} isProjectListHydrated={isProjectListHydrated} />} />
      </Routes>
    </AppProviders>
  )
}
