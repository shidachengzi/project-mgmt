import { AppstoreOutlined, BellOutlined, CalendarOutlined, FolderOpenOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, QuestionCircleOutlined, SearchOutlined, SettingOutlined, TeamOutlined } from '@ant-design/icons'
import { Avatar, Badge, Button, Divider, Input, Layout, Menu, Space, Tooltip, Typography } from 'antd'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { PrimaryNavItem } from '../widgets/main-layout/PrimaryNavItem'
import { MessageInboxDrawer, useMessageInbox } from '../widgets/main-layout/inbox'
import { avatarColorForId, projectColorForId } from '../widgets/main-layout/layoutUtils'
import { useAccountStore } from '../entities/account/model/useAccountStore'
import { useAuthStore } from '../entities/auth/model/useAuthStore'
import { useOrgStore } from '../entities/org/model/useOrgStore'
import { useCanOpenAdminConsole } from '../entities/permission/systemPermissions'
import { isBackendAuthEnabled } from '../shared/api/backendClient'
import { fetchBackendPreferences } from '../shared/api/meAccountApi'

const { Sider, Header, Content } = Layout

type ProjectNavItem = {
  id: string
  title: string
}

type MainLayoutProps = {
  headerLeft?: ReactNode
  showSecondarySider?: boolean
  activePrimaryNavKey?: 'workbench' | 'projects' | 'calendar' | 'contacts'
  onPrimaryNavChange?: (key: 'workbench' | 'projects' | 'calendar' | 'contacts') => void
  projects?: ProjectNavItem[]
  activeWorkMenuKey?: string
  onWorkMenuChange?: (key: string) => void
  activeWorkSection?: 'work' | 'projects'
  onOpenAdmin?: () => void
  onOpenAccountSettings?: () => void
  children: ReactNode
}

export function MainLayout({
  headerLeft,
  showSecondarySider = true,
  activePrimaryNavKey = 'projects',
  onPrimaryNavChange,
  projects = [],
  activeWorkMenuKey = 'all',
  onWorkMenuChange,
  activeWorkSection = 'work',
  onOpenAdmin,
  onOpenAccountSettings,
  children,
}: MainLayoutProps) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [primaryMenuCollapsed, setPrimaryMenuCollapsed] = useState(false)

  const account = useAccountStore(s => s.profile)
  const patchProfile = useAccountStore(s => s.patchProfile)
  const authedUserId = useAuthStore(s => s.authedUserId)
  const orgMembers = useOrgStore(s => s.members)
  const logout = useAuthStore(s => s.logout)
  const canOpenAdmin = useCanOpenAdminConsole()

  const inbox = useMessageInbox()

  const projectMenuItems = useMemo(
    () =>
      projects.map(p => ({
        key: p.id,
        label: (
          <span className="wt-project-mini">
            <span className="wt-project-mini__dot" style={{ background: projectColorForId(p.id) }} />
            {p.title}
          </span>
        ),
      })),
    [projects],
  )

  const currentOrgMember = useMemo(() => (authedUserId ? orgMembers.find(m => m.id === authedUserId) : undefined), [orgMembers, authedUserId])

  const accountAvatarSrc = account.avatarDataUrl?.trim() || undefined
  const accountAvatarInitials = currentOrgMember?.avatarText ?? (account.name || 'DA').slice(0, 2).toUpperCase()
  const accountAvatarColor = currentOrgMember?.avatarColor ?? (authedUserId ? avatarColorForId(authedUserId) : undefined)
  const accountHeaderAvatarStyle = !accountAvatarSrc ? { background: accountAvatarColor ?? '#1677ff', color: '#fff' as const } : undefined
  const accountProfileAvatarStyle = !accountAvatarSrc ? { background: accountAvatarColor ?? '#f28888', color: '#fff' as const } : undefined

  useEffect(() => {
    if (!isBackendAuthEnabled() || !authedUserId) return
    let cancelled = false
    void fetchBackendPreferences().then(res => {
      if (cancelled || !res.ok) return
      const url = res.prefs.accountAvatarDataUrl?.trim()
      if (url) patchProfile({ avatarDataUrl: url })
    })
    return () => {
      cancelled = true
    }
  }, [authedUserId, patchProfile])

  const profileCard = (
    <div className="wt-profile-popover">
      <div className="wt-profile-popover__banner" />
      <div className="wt-profile-popover__body">
        <Avatar size={72} className="wt-profile-popover__avatar" src={accountAvatarSrc} style={accountProfileAvatarStyle}>
          {!accountAvatarSrc ? accountAvatarInitials : null}
        </Avatar>
        <div className="wt-profile-popover__name">{account.name}</div>
        <div className="wt-profile-popover__team">dachengzi的团队</div>
        <Divider style={{ margin: '12px 0' }} />
        <Button
          type="text"
          block
          className="wt-profile-popover__item"
          onClick={() => {
            setProfileOpen(false)
            onOpenAccountSettings?.()
          }}
        >
          <SettingOutlined />
          账号资料设置
        </Button>
        {canOpenAdmin ? (
          <Button
            type="text"
            block
            className="wt-profile-popover__item"
            onClick={() => {
              setProfileOpen(false)
              onOpenAdmin?.()
            }}
          >
            <SettingOutlined />
            管理后台
          </Button>
        ) : null}
        <Divider style={{ margin: '12px 0' }} />
        <Button
          type="text"
          block
          danger
          className="wt-profile-popover__item wt-profile-popover__item--danger"
          onClick={() => {
            logout()
            setProfileOpen(false)
            window.location.hash = '#/login'
          }}
        >
          <LogoutOutlined />
          退出登录
        </Button>
      </div>
    </div>
  )

  const primaryNavCollapsed = primaryMenuCollapsed

  const menuCollapseTrigger = () => {
    const label = primaryMenuCollapsed ? '展开菜单' : '收起菜单'
    const btn = (
      <Button
        type="text"
        className="wt-sider-collapse-trigger wt-sider-collapse-trigger--dark"
        aria-label={label}
        icon={primaryMenuCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={() => setPrimaryMenuCollapsed(v => !v)}
      />
    )
    return (
      <Tooltip title={label} placement="right">
        {btn}
      </Tooltip>
    )
  }

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        width={182}
        collapsedWidth={64}
        className="wt-primary-sider"
        theme="dark"
        collapsible
        collapsed={primaryMenuCollapsed}
        onCollapse={setPrimaryMenuCollapsed}
        trigger={null}
      >
        <div className="wt-primary-nav">
          <div className="wt-primary-nav__team">Worktile</div>
          <PrimaryNavItem active={activePrimaryNavKey === 'workbench'} label="工作台" collapsed={primaryNavCollapsed} icon={<AppstoreOutlined />} onClick={() => onPrimaryNavChange?.('workbench')} />
          <PrimaryNavItem active={activePrimaryNavKey === 'projects'} label="项目" collapsed={primaryNavCollapsed} icon={<FolderOpenOutlined />} onClick={() => onPrimaryNavChange?.('projects')} />
          <PrimaryNavItem active={activePrimaryNavKey === 'calendar'} label="日历" collapsed={primaryNavCollapsed} icon={<CalendarOutlined />} onClick={() => onPrimaryNavChange?.('calendar')} />
          <PrimaryNavItem active={activePrimaryNavKey === 'contacts'} label="通讯录" collapsed={primaryNavCollapsed} icon={<TeamOutlined />} onClick={() => onPrimaryNavChange?.('contacts')} />
          <div style={{ flex: 1 }} />
          <div className="wt-sider-collapse-footer">{menuCollapseTrigger()}</div>
        </div>
      </Sider>

      <Layout style={{ overflow: 'hidden' }}>
        <Header className="wt-main-header" style={{ background: '#fff', paddingInline: 20 }}>
          <div className="wt-main-header__left">
            {headerLeft ?? (
              <Typography.Title level={5} style={{ margin: 0, fontWeight: 600 }}>
                项目
              </Typography.Title>
            )}
          </div>
          <Space size="middle">
            <Input allowClear prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} placeholder="搜索" style={{ width: 200 }} variant="filled" />
            <Button type="text" icon={<QuestionCircleOutlined />} />
            <Badge count={inbox.headerBellCount > 0 ? inbox.headerBellCount : 0} size="small" overflowCount={99}>
              <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} onClick={inbox.openDrawer} />
            </Badge>
            <button type="button" className="wt-main-header__avatar-btn" aria-label="账号菜单" onClick={() => setProfileOpen(v => !v)}>
              <Avatar size={32} className="wt-main-header__avatar" src={accountAvatarSrc} style={accountHeaderAvatarStyle}>
                {!accountAvatarSrc ? accountAvatarInitials : null}
              </Avatar>
            </button>
          </Space>
        </Header>

        <Layout style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
          {showSecondarySider ? (
            <Sider width={232} theme="light" className="wt-secondary-sider" collapsible={false} style={{ borderRight: '1px solid #f0f0f0', minHeight: 'calc(100vh - 56px)', overflow: 'hidden' }}>
              <div className="wt-secondary-sider__menus" style={{ padding: '12px 0 8px', height: '100%', minHeight: 0, overflow: 'auto' }}>
                <Typography.Text type="secondary" style={{ paddingLeft: 16, fontSize: 12 }}>
                  工作
                </Typography.Text>
                <Menu
                  mode="inline"
                  selectedKeys={activeWorkSection === 'work' ? [activeWorkMenuKey] : []}
                  style={{ border: 'none' }}
                  onClick={({ key }) => onWorkMenuChange?.(String(key))}
                  items={[
                    { key: 'mine', label: '我的任务' },
                    { key: 'all', label: '全部项目' },
                    { key: 'reports', label: '报表' },
                  ]}
                />
                <Typography.Text type="secondary" style={{ paddingLeft: 16, fontSize: 12, display: 'block', marginTop: 8 }}>
                  项目
                </Typography.Text>
                <Menu mode="inline" selectedKeys={activeWorkSection === 'projects' ? [activeWorkMenuKey] : []} onClick={({ key }) => onWorkMenuChange?.(String(key))} style={{ border: 'none' }} items={projectMenuItems} />
              </div>
            </Sider>
          ) : null}
          <Content
            style={{
              background: '#fafafa',
              height: '100%',
              minHeight: 0,
              minWidth: 0,
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {children}
          </Content>
        </Layout>
      </Layout>
      {profileOpen ? (
        <div className="wt-profile-popover__mask" onClick={() => setProfileOpen(false)}>
          <div className="wt-profile-popover__panel" onClick={e => e.stopPropagation()}>
            {profileCard}
          </div>
        </div>
      ) : null}
      <MessageInboxDrawer
        open={inbox.drawerOpen}
        onClose={inbox.closeDrawer}
        activeTab={inbox.activeTab}
        onTabChange={inbox.setActiveTab}
        tabItems={inbox.tabItems}
      />
    </Layout>
  )
}
