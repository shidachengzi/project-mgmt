import { Avatar, Button, Form, Input, Modal, Spin, Typography, message, Table } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAccountStore } from '../../entities/account/model/useAccountStore'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { fetchBackendAccessLogs, fetchBackendMe, fetchBackendPreferences, patchBackendAccountFields, patchBackendPassword, patchBackendPreferencesAvatar } from '../../shared/api/meAccountApi'

type BasePanelKey = 'username' | 'password' | 'email' | 'phone'

export function AccountSettingsPage() {
  const location = useLocation()
  const activeTab = (new URLSearchParams(location.search).get('tab') as 'basic' | 'profile' | 'logs') || 'basic'
  const backendAuth = isBackendAuthEnabled()

  const [openPanel, setOpenPanel] = useState<Record<BasePanelKey, boolean>>({
    username: false,
    password: false,
    email: false,
    phone: false
  })

  const toggle = (key: BasePanelKey) => setOpenPanel(prev => ({ ...prev, [key]: !prev[key] }))

  const profile = useAccountStore(s => s.profile)
  const setProfile = useAccountStore(s => s.setProfile)
  const logs = useAccountStore(s => s.logs)
  const setLogs = useAccountStore(s => s.setLogs)

  const [usernameForm] = Form.useForm<{ username: string }>()
  const [passwordForm] = Form.useForm<{ oldPassword: string; newPassword: string }>()
  const [emailForm] = Form.useForm<{ email: string }>()
  const [phoneForm] = Form.useForm<{ phone: string }>()
  const [resetOpen, setResetOpen] = useState(false)
  const [resetForm] = Form.useForm<{ email: string; newPassword: string }>()
  const [profileForm] = Form.useForm<{ name: string }>()

  const [profileRemoteLoading, setProfileRemoteLoading] = useState(false)
  const [logsRemoteLoading, setLogsRemoteLoading] = useState(false)
  const [logsPage, setLogsPage] = useState(1)
  const [logsPageSize, setLogsPageSize] = useState(10)
  const [logsTotal, setLogsTotal] = useState(0)

  const saveProfile = (next: typeof profile) => {
    setProfile(next)
  }

  useEffect(() => {
    usernameForm.setFieldsValue({ username: profile.code })
    emailForm.setFieldsValue({ email: profile.email })
    phoneForm.setFieldsValue({ phone: profile.phone })
    profileForm.setFieldsValue({ name: profile.name })
  }, [emailForm, phoneForm, profile.code, profile.email, profile.name, profile.phone, profileForm, usernameForm])

  useEffect(() => {
    if (!backendAuth || activeTab !== 'basic') return
    let cancelled = false
    void (async () => {
      const me = await fetchBackendMe()
      if (cancelled || !me.ok) return
      useAccountStore.getState().patchProfile({
        name: me.user.name,
        email: me.user.email || '',
        phone: me.user.mobile || '',
        code: me.user.username ?? ''
      })
    })()
    return () => {
      cancelled = true
    }
  }, [activeTab, backendAuth])

  useEffect(() => {
    if (!backendAuth || activeTab !== 'profile') return
    let cancelled = false
    setProfileRemoteLoading(true)
    void (async () => {
      const [me, pref] = await Promise.all([fetchBackendMe(), fetchBackendPreferences()])
      if (cancelled) return
      setProfileRemoteLoading(false)
      if (!me.ok) {
        message.error(me.message)
        return
      }
      if (!pref.ok) {
        message.error(pref.message)
        return
      }
      useAccountStore.getState().patchProfile({
        name: me.user.name,
        email: me.user.email || '',
        phone: me.user.mobile || '',
        code: me.user.username ?? '',
        avatarDataUrl: pref.prefs.accountAvatarDataUrl || undefined
      })
      profileForm.setFieldsValue({ name: me.user.name })
    })()
    return () => {
      cancelled = true
    }
  }, [activeTab, backendAuth, profileForm])

  useEffect(() => {
    if (!backendAuth || activeTab !== 'logs') return
    let cancelled = false
    setLogsRemoteLoading(true)
    void (async () => {
      const r = await fetchBackendAccessLogs(logsPage, logsPageSize)
      if (cancelled) return
      setLogsRemoteLoading(false)
      if (!r.ok) {
        message.error(r.message)
        setLogs([])
        setLogsTotal(0)
        return
      }
      setLogsTotal(r.total)
      const mapped = r.items.map(row => ({
        id: row.id,
        location: [row.ip ? `IP ${row.ip}` : null, row.path].filter(Boolean).join(' · ') || row.path,
        platform: 'Web 客户端',
        device: (row.userAgent || '—').slice(0, 160),
        time: new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false })
      }))
      setLogs(mapped)
    })()
    return () => {
      cancelled = true
    }
  }, [activeTab, backendAuth, logsPage, logsPageSize, setLogs])

  const renderBasic = () => (
    <div className="wt-account-settings__stack">
      <section className="wt-account-settings__card">
        <header className="wt-account-settings__card-head">
          <div>
            <div className="wt-account-settings__title">修改用户名</div>
            <Typography.Text type="secondary" className="wt-account-settings__desc">
              {backendAuth ? '用户名将同步到企业账号，需全局唯一。' : '修改你在当前企业的用户名（登录用户名）。'}
            </Typography.Text>
          </div>
          <button type="button" className="wt-account-settings__toggle" onClick={() => toggle('username')}>
            {openPanel.username ? '收起' : '展开'}
          </button>
        </header>
        {openPanel.username ? (
          <Form
            form={usernameForm}
            layout="vertical"
            className="wt-account-settings__form"
            onFinish={async v => {
              const code = String(v.username ?? '').trim()
              if (!code) return
              if (backendAuth) {
                const res = await patchBackendAccountFields({ username: code })
                if (!res.ok) {
                  message.error(res.message)
                  return
                }
                const prev = useAccountStore.getState().profile
                useAccountStore.getState().setProfile({ ...prev, code })
                message.success('用户名已保存')
                return
              }
              saveProfile({ ...profile, code })
              message.success('用户名已保存')
            }}
          >
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input placeholder="请输入用户名" />
            </Form.Item>
            <Button htmlType="submit" type="primary" size="small">
              保存
            </Button>
          </Form>
        ) : null}
      </section>

      <section className="wt-account-settings__card">
        <header className="wt-account-settings__card-head">
          <div>
            <div className="wt-account-settings__title">修改密码</div>
            <Typography.Text type="secondary" className="wt-account-settings__desc">
              {backendAuth ? '修改需验证当前密码。若忘记密码，请退出后使用登录页的「找回密码」。' : '修改密码时需要输入当前密码，如果忘记了当前密码，可以点击重置密码（通过邮箱）。'}
            </Typography.Text>
          </div>
          <button type="button" className="wt-account-settings__toggle" onClick={() => toggle('password')}>
            {openPanel.password ? '收起' : '展开'}
          </button>
        </header>
        {openPanel.password ? (
          <Form
            form={passwordForm}
            layout="vertical"
            className="wt-account-settings__form"
            onFinish={async v => {
              const oldPassword = String(v.oldPassword ?? '')
              const newPassword = String(v.newPassword ?? '')
              if (newPassword.trim().length < 6) {
                message.warning('新密码长度不少于 6')
                return
              }
              if (!backendAuth) {
                message.warning('请连接后端后修改密码')
                return
              }
              const res = await patchBackendPassword(oldPassword, newPassword)
              if (!res.ok) {
                message.error(res.message)
                return
              }
              passwordForm.resetFields()
              message.success('密码已修改')
            }}
          >
            <Form.Item name="oldPassword" rules={[{ required: true, message: '请输入旧密码' }]}>
              <Input.Password placeholder="旧密码" />
            </Form.Item>
            <Form.Item name="newPassword" rules={[{ required: true, message: '请输入新密码' }]}>
              <Input.Password placeholder="新密码" />
            </Form.Item>
            <Typography.Text type="secondary" className="wt-account-settings__hint">
              密码长度不少于 6 位
            </Typography.Text>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Button htmlType="submit" type="primary" size="small">
                保存
              </Button>
              {backendAuth ? (
                <Link to="/forgot-password" style={{ fontSize: 13 }}>
                  忘记密码？找回密码
                </Link>
              ) : (
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() => {
                    resetForm.setFieldsValue({ email: profile.email })
                    setResetOpen(true)
                  }}
                >
                  重置密码
                </Button>
              )}
            </div>
          </Form>
        ) : null}
      </section>

      <section className="wt-account-settings__card">
        <header className="wt-account-settings__card-head">
          <div>
            <div className="wt-account-settings__title">修改邮箱</div>
            <Typography.Text type="secondary" className="wt-account-settings__desc">
              你当前的邮箱是 {profile.email}，可直接修改并保存（需与手机号至少保留一项）。
            </Typography.Text>
          </div>
          <button type="button" className="wt-account-settings__toggle" onClick={() => toggle('email')}>
            {openPanel.email ? '收起' : '展开'}
          </button>
        </header>
        {openPanel.email ? (
          <Form
            form={emailForm}
            layout="vertical"
            className="wt-account-settings__form"
            onFinish={async v => {
              const email = String(v.email ?? '').trim()
              if (!email) return
              if (backendAuth) {
                const res = await patchBackendAccountFields({ email })
                if (!res.ok) {
                  message.error(res.message)
                  return
                }
                const prev = useAccountStore.getState().profile
                useAccountStore.getState().setProfile({ ...prev, email })
                message.success('邮箱已保存')
                return
              }
              saveProfile({ ...profile, email })
              message.success('邮箱已保存')
            }}
          >
            <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱地址' }]}>
              <Input placeholder="请输入新的邮箱地址" />
            </Form.Item>
            <Button htmlType="submit" type="primary" size="small">
              保存
            </Button>
          </Form>
        ) : null}
      </section>

      <section className="wt-account-settings__card">
        <header className="wt-account-settings__card-head">
          <div>
            <div className="wt-account-settings__title">修改手机</div>
            <Typography.Text type="secondary" className="wt-account-settings__desc">
              你当前手机号是 {profile.phone}，可直接修改并保存（需与邮箱至少保留一项）。
            </Typography.Text>
          </div>
          <button type="button" className="wt-account-settings__toggle" onClick={() => toggle('phone')}>
            {openPanel.phone ? '收起' : '展开'}
          </button>
        </header>
        {openPanel.phone ? (
          <Form
            form={phoneForm}
            layout="vertical"
            className="wt-account-settings__form"
            onFinish={async v => {
              const phone = String(v.phone ?? '').trim()
              if (!phone) return
              if (backendAuth) {
                const res = await patchBackendAccountFields({ mobile: phone })
                if (!res.ok) {
                  message.error(res.message)
                  return
                }
                const prev = useAccountStore.getState().profile
                useAccountStore.getState().setProfile({ ...prev, phone })
                message.success('手机号已保存')
                return
              }
              saveProfile({ ...profile, phone })
              message.success('手机号已保存')
            }}
          >
            <Form.Item name="phone" rules={[{ required: true, message: '请输入手机号' }]}>
              <Input placeholder="请输入新手机号" />
            </Form.Item>
            <Button htmlType="submit" type="primary" size="small">
              保存
            </Button>
          </Form>
        ) : null}
      </section>
    </div>
  )

  const renderProfile = () => (
    <Spin spinning={backendAuth && profileRemoteLoading}>
      <div className="wt-account-settings__stack">
        <section className="wt-account-settings__card">
          <div className="wt-account-profile">
            <div className="wt-account-profile__avatar-row">
              <div className="wt-account-profile__avatar-wrap">
                <Avatar size={84} src={profile.avatarDataUrl} style={!profile.avatarDataUrl ? { background: '#ff7875' } : undefined}>
                  {!profile.avatarDataUrl ? (profile.name || 'D').slice(0, 2).toUpperCase() : null}
                </Avatar>
              </div>
              <div className="wt-account-profile__upload">
                <Button
                  type="primary"
                  size="small"
                  onClick={() => {
                    const el = document.getElementById('wt-account-avatar-input') as HTMLInputElement | null
                    el?.click()
                  }}
                >
                  选择照片上传
                </Button>
                <Typography.Text type="secondary" className="wt-account-profile__upload-hint">
                  仅支持JPG,GIF,PNG格式上传，大小不超过1M
                </Typography.Text>
              </div>
            </div>

            <div className="wt-account-profile__section">
              <div className="wt-account-profile__section-title">个人资料</div>
              <Form
                form={profileForm}
                layout="vertical"
                className="wt-account-settings__form"
                onFinish={async v => {
                  const name = String(v.name ?? '').trim()
                  if (!name) return
                  if (backendAuth) {
                    const res = await patchBackendAccountFields({ name })
                    if (!res.ok) {
                      message.error(res.message)
                      return
                    }
                    const prev = useAccountStore.getState().profile
                    useAccountStore.getState().setProfile({ ...prev, name })
                    message.success('个人信息已保存')
                    return
                  }
                  saveProfile({ ...profile, name })
                  message.success('个人信息已保存')
                }}
              >
                <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]} help={<span style={{ color: 'rgba(0,0,0,0.45)' }}>真实姓名，企业成员知道如何称呼你</span>}>
                  <Input placeholder="" />
                </Form.Item>
                <Button htmlType="submit" type="primary" size="small">
                  保存
                </Button>
              </Form>
            </div>
          </div>

          <input
            id="wt-account-avatar-input"
            type="file"
            accept="image/png,image/jpeg,image/gif"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              e.currentTarget.value = ''
              if (!file) return
              if (file.size > 1024 * 1024) {
                message.warning('图片大小不能超过 1M')
                return
              }
              const reader = new FileReader()
              reader.onload = () => {
                void (async () => {
                  const dataUrl = typeof reader.result === 'string' ? reader.result : ''
                  if (!dataUrl) return
                  if (backendAuth) {
                    const res = await patchBackendPreferencesAvatar(dataUrl)
                    if (!res.ok) {
                      message.error(res.message)
                      return
                    }
                  }
                  const prev = useAccountStore.getState().profile
                  useAccountStore.getState().setProfile({ ...prev, avatarDataUrl: dataUrl })
                  message.success('头像已更新')
                })()
              }
              reader.readAsDataURL(file)
            }}
          />
        </section>
      </div>
    </Spin>
  )

  return (
    <div className="wt-account-settings">
      {activeTab === 'basic' ? (
        renderBasic()
      ) : activeTab === 'profile' ? (
        renderProfile()
      ) : activeTab === 'logs' ? (
        <div className="wt-account-settings__stack wt-account-settings__stack--logs">
          <section className="wt-account-settings__card wt-account-settings__logs-panel">
            <Spin spinning={backendAuth && logsRemoteLoading}>
              <Table
                rowKey="id"
                className="wt-console-table wt-account-settings__log-table"
                columns={[
                  { title: '访问信息', dataIndex: 'location', key: 'location' },
                  { title: '平台', dataIndex: 'platform', key: 'platform', width: 120 },
                  { title: '设备 / UA', dataIndex: 'device', key: 'device' },
                  { title: '时间', dataIndex: 'time', key: 'time', width: 180 }
                ]}
                dataSource={logs}
                scroll={{ y: 'calc(100vh - 280px)' }}
                pagination={
                  backendAuth
                    ? {
                        current: logsPage,
                        pageSize: logsPageSize,
                        total: logsTotal,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50'],
                        showTotal: t => `共 ${t} 条`,
                        onChange: (p, ps) => {
                          setLogsPage(p)
                          setLogsPageSize(ps)
                        }
                      }
                    : false
                }
                bordered={false}
              />
            </Spin>
          </section>
        </div>
      ) : (
        <div className="wt-account-settings__placeholder">该分栏建设中</div>
      )}

      <Modal
        open={resetOpen}
        title="重置密码"
        okText="确定"
        cancelText="取消"
        onCancel={() => setResetOpen(false)}
        onOk={() => {
          message.warning('请连接后端后使用登录页的「找回密码」')
          setResetOpen(false)
        }}
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item label="邮箱" name="email" rules={[{ required: true, message: '请输入邮箱' }]}>
            <Input placeholder="请输入邮箱" />
          </Form.Item>
          <Form.Item label="新密码" name="newPassword" rules={[{ required: true, message: '请输入新密码' }]}>
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
