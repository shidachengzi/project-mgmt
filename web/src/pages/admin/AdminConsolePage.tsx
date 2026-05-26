import { BellOutlined, CloudServerOutlined, MailOutlined, TeamOutlined, UserSwitchOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Layout, Menu, Spin, Typography } from 'antd'
import { useMemo } from 'react'
import { Navigate, Route, Routes, useMatch, useNavigate } from 'react-router-dom'
import { AdminBroadcastNotificationsPanel } from '../../features/admin-console/notifications/AdminBroadcastNotificationsPanel'
import { AdminMembersPanel } from '../../features/admin-console/members/AdminMembersPanel'
import { AdminRolesPanel } from '../../features/admin-console/roles/AdminRolesPanel'
import { AdminSystemMailPanel } from '../../features/admin-console/settings/AdminSystemMailPanel'
import { AdminSystemServicePanel } from '../../features/admin-console/settings/AdminSystemServicePanel'
import { useBackendDataStore } from '../../entities/workspace/model/backendDataStore'
import { useHasSystemPermission } from '../../entities/permission/systemPermissions'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'

const { Sider, Header, Content } = Layout

const TAB_KEYS = ['members', 'roles', 'notifications', 'service', 'email'] as const
type AdminConsoleTab = (typeof TAB_KEYS)[number]

function normalizeTab(raw: string | undefined): AdminConsoleTab {
  const v = raw ?? 'members'
  return (TAB_KEYS as readonly string[]).includes(v) ? (v as AdminConsoleTab) : 'members'
}

export function AdminConsolePage() {
  const navigate = useNavigate()
  const match = useMatch('/console/:tab?')
  const active = normalizeTab(match?.params.tab)
  const systemLoaded = useBackendDataStore(s => s.systemLoaded)

  const canManageMembers = useHasSystemPermission('member.manage')
  const canManageRoles = useHasSystemPermission('role.manage')
  const canBroadcast = useHasSystemPermission('notification.broadcast')
  const canSystemConfig = useHasSystemPermission('system.config')
  const canEnterConsole = canManageMembers || canManageRoles || canBroadcast || canSystemConfig

  const allowedTabs = useMemo(() => {
    const s = new Set<AdminConsoleTab>()
    if (canManageMembers) s.add('members')
    if (canManageRoles) s.add('roles')
    if (canBroadcast) s.add('notifications')
    if (canSystemConfig) {
      s.add('service')
      s.add('email')
    }
    return s
  }, [canManageMembers, canManageRoles, canBroadcast, canSystemConfig])

  const visibleActive = useMemo((): AdminConsoleTab => {
    if (allowedTabs.has(active)) return active
    if (allowedTabs.has('members')) return 'members'
    if (allowedTabs.has('roles')) return 'roles'
    if (allowedTabs.has('notifications')) return 'notifications'
    if (allowedTabs.has('service')) return 'service'
    if (allowedTabs.has('email')) return 'email'
    return 'members'
  }, [active, allowedTabs])

  const headerTitle = useMemo(() => {
    if (visibleActive === 'roles') return '角色管理'
    if (visibleActive === 'notifications') return '全员通知'
    if (visibleActive === 'service') return '系统配置 · 服务'
    if (visibleActive === 'email') return '系统配置 · 邮件'
    return '成员管理'
  }, [visibleActive])

  const menuItems = useMemo((): MenuProps['items'] => {
    const items: MenuProps['items'] = []
    if (canManageMembers) items.push({ key: 'members', icon: <TeamOutlined />, label: '成员管理' })
    if (canManageRoles) items.push({ key: 'roles', icon: <UserSwitchOutlined />, label: '角色管理' })
    if (canBroadcast) {
      items.push({ key: 'notifications', icon: <BellOutlined />, label: '全员通知' })
    }
    if (canSystemConfig) {
      items.push({
        type: 'group',
        label: '系统配置',
        children: [
          { key: 'service', icon: <CloudServerOutlined />, label: '服务' },
          { key: 'email', icon: <MailOutlined />, label: '邮件' }
        ]
      })
    }
    return items
  }, [canManageMembers, canManageRoles, canBroadcast, canSystemConfig])

  if (isBackendAuthEnabled() && !systemLoaded) {
    return <Spin fullscreen size="large" />
  }

  if (!canEnterConsole) return <Navigate to="/workbench" replace />

  if (active !== visibleActive) {
    return <Navigate to={`/console/${visibleActive}`} replace />
  }

  const defaultRedirect = (['members', 'roles', 'notifications', 'service', 'email'] as const).find(t => allowedTabs.has(t)) ?? 'members'

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden', background: '#f5f6f8' }}>
      <Sider width={220} theme="light" style={{ borderRight: '1px solid #f0f0f0', height: '100vh', overflowY: 'auto' }}>
        <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#1677ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>管</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>项目管理系统</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              管理后台
            </Typography.Text>
          </div>
        </div>
        <Menu mode="inline" selectedKeys={[visibleActive]} style={{ border: 'none' }} onClick={({ key }) => navigate(`/console/${String(key)}`)} items={menuItems} />
      </Sider>

      <Layout style={{ display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0, overflow: 'hidden' }}>
        <Header
          style={{
            flexShrink: 0,
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Typography.Title level={5} style={{ margin: 0 }}>
            {headerTitle}
          </Typography.Title>
          <span />
        </Header>
        <Content
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box'
          }}
        >
          <div
            style={{
              background: '#fff',
              border: '1px solid #f0f0f0',
              padding: 16,
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              boxSizing: 'border-box'
            }}
          >
            <Routes>
              {canManageMembers ? <Route path="/members" element={<AdminMembersPanel />} /> : null}
              {canManageRoles ? <Route path="/roles" element={<AdminRolesPanel />} /> : null}
              {canBroadcast ? <Route path="/notifications" element={<AdminBroadcastNotificationsPanel />} /> : null}
              {canSystemConfig ? <Route path="/service" element={<AdminSystemServicePanel />} /> : null}
              {canSystemConfig ? <Route path="/email" element={<AdminSystemMailPanel />} /> : null}
              <Route path="*" element={<Navigate to={`/console/${defaultRedirect}`} replace />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default AdminConsolePage
