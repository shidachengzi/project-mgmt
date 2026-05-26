import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  MailOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd'
import { useEffect, useState } from 'react'
import {
  fetchAdminSystemConfig,
  patchAdminMailConfig,
  postAdminTestMail,
  type AdminSystemConfigDTO,
} from '../../../shared/api/adminSystemConfigApi'
import { isBackendAuthEnabled } from '../../../shared/api/backendClient'

type MailFormValues = {
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpTlsSkipVerify: boolean
  smtpFrom: string
  smtpUser: string
  authPass: string
  clearAuthPass: boolean
}

function sourceTag(source: AdminSystemConfigDTO['mail']['source']) {
  if (source === 'database') return <Tag color="blue">数据库（项目管理系统）</Tag>
  if (source === 'environment') return <Tag color="gold">环境变量</Tag>
  return <Tag>未配置</Tag>
}

export function AdminSystemMailPanel() {
  const { message } = App.useApp()
  const [data, setData] = useState<AdminSystemConfigDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [form] = Form.useForm<MailFormValues>()
  const [testForm] = Form.useForm<{ to: string }>()
  const [formKey, setFormKey] = useState(0)

  const load = async () => {
    if (!isBackendAuthEnabled()) {
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await fetchAdminSystemConfig()
    if (!res.ok) {
      message.error(res.message)
      setData(null)
    } else {
      setData(res.data)
      const fi = res.data.mail.formInitial
      form.setFieldsValue({
        smtpHost: fi.smtpHost,
        smtpPort: fi.smtpPort,
        smtpSecure: fi.smtpSecure,
        smtpTlsSkipVerify: fi.smtpTlsSkipVerify ?? false,
        smtpFrom: fi.smtpFrom,
        smtpUser: fi.smtpUser,
        authPass: '',
        clearAuthPass: false,
      })
      setFormKey(k => k + 1)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时拉取
  }, [])

  if (!isBackendAuthEnabled()) {
    return (
      <Card variant="borderless" style={{ maxWidth: 640 }}>
        <Alert
          type="info"
          showIcon
          message="本地模式"
          description="当前为本地模式，邮件由服务端发送；请启用后端会话后在项目管理系统中配置 SMTP。"
        />
      </Card>
    )
  }

  if (loading) {
    return (
      <Card variant="borderless" styles={{ body: { padding: '64px 24px', textAlign: 'center' } }}>
        <Spin size="large" tip="加载邮件配置…" spinning>
          <div style={{ minHeight: 120 }} />
        </Spin>
      </Card>
    )
  }
  if (!data) return null

  const m = data.mail

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <Space align="start" size={16} style={{ marginBottom: 20 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #1677ff 0%, #4096ff 55%, #69b1ff 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 26,
            flexShrink: 0,
            boxShadow: '0 4px 14px rgba(22, 119, 255, 0.35)',
          }}
        >
          <MailOutlined />
        </div>
        <div style={{ minWidth: 0 }}>
          <Typography.Title level={4} style={{ margin: '0 0 6px' }}>
            系统邮件（SMTP）
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 720 }}>
            在此保存的配置会写入数据库，并<strong>优先于</strong>服务器环境变量生效，用于系统通知、测试信与（若开启）邮件类提醒。
          </Typography.Paragraph>
        </div>
      </Space>

      <Alert
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message="口令加密存储"
        description={
          <span>
            发件口令使用 AES-256-GCM 加密；密钥由环境变量{' '}
            <Typography.Text code>SETTINGS_ENCRYPTION_SECRET</Typography.Text>（推荐）或{' '}
            <Typography.Text code>JWT_REFRESH_SECRET</Typography.Text> 派生。请勿在代码仓库中提交真实密钥。
          </span>
        }
        style={{ marginBottom: 20 }}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            title={
              <Space>
                <InfoCircleOutlined style={{ color: '#1677ff' }} />
                <span>当前状态</span>
              </Space>
            }
            extra={
              <Button type="text" size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
                刷新
              </Button>
            }
            styles={{ body: { paddingTop: 12 } }}
          >
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  是否可发信
                </Typography.Text>
                <div style={{ marginTop: 6 }}>
                  {m.configured ? (
                    <Badge status="success" text={<span style={{ fontWeight: 500 }}>已就绪</span>} />
                  ) : (
                    <Badge status="default" text={<span style={{ fontWeight: 500 }}>未就绪</span>} />
                  )}
                </div>
              </div>

              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  生效来源
                </Typography.Text>
                <div style={{ marginTop: 6 }}>{sourceTag(m.source)}</div>
              </div>

              <Divider style={{ margin: '4px 0' }} />

              <div
                style={{
                  background: '#fafafa',
                  borderRadius: 8,
                  padding: '12px 14px',
                  border: '1px solid #f0f0f0',
                }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  当前生效连接
                </Typography.Text>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Typography.Text>
                    <Typography.Text type="secondary">服务器</Typography.Text>{' '}
                    <Typography.Text strong>{m.host ?? '—'}</Typography.Text>
                  </Typography.Text>
                  <Typography.Text>
                    <Typography.Text type="secondary">端口</Typography.Text>{' '}
                    <Typography.Text code>{m.port}</Typography.Text>
                    <Tag style={{ marginLeft: 8 }} color={m.secure ? 'green' : 'default'}>
                      {m.secure ? 'TLS' : '非 TLS'}
                    </Tag>
                  </Typography.Text>
                  <Typography.Text ellipsis={{ tooltip: m.from }}>
                    <Typography.Text type="secondary">发件人</Typography.Text>{' '}
                    <Typography.Text>{m.from ?? '—'}</Typography.Text>
                  </Typography.Text>
                  <Tag color={(m.tlsSkipVerify ?? false) ? 'orange' : 'blue'} style={{ marginTop: 4 }}>
                    TLS 证书{(m.tlsSkipVerify ?? false) ? '不校验（自签/内网）' : '校验'}
                  </Tag>
                  <Space size={8} wrap style={{ marginTop: 4 }}>
                    <Tag icon={m.authUserSet ? <CheckCircleOutlined /> : <CloseCircleOutlined />} color={m.authUserSet ? 'success' : 'default'}>
                      用户名{m.authUserSet ? '已配置' : '未配置'}
                    </Tag>
                    <Tag icon={m.authPassSet ? <CheckCircleOutlined /> : <CloseCircleOutlined />} color={m.authPassSet ? 'success' : 'default'}>
                      口令{m.authPassSet ? '已保存' : '未保存'}
                    </Tag>
                  </Space>
                </Space>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            title="SMTP 设置"
            styles={{ body: { paddingBottom: 8 } }}
          >
            <Form<MailFormValues>
              key={formKey}
              form={form}
              layout="vertical"
              requiredMark="optional"
              onFinish={async v => {
                setSaving(true)
                try {
                  const res = await patchAdminMailConfig({
                    smtpHost: v.smtpHost.trim() || null,
                    smtpPort: v.smtpPort,
                    smtpSecure: v.smtpSecure,
                    smtpTlsSkipVerify: v.smtpTlsSkipVerify,
                    smtpFrom: v.smtpFrom.trim() || null,
                    smtpUser: v.smtpUser.trim() || null,
                    clearAuthPass: v.clearAuthPass,
                    ...(v.clearAuthPass ? {} : v.authPass.trim() ? { authPass: v.authPass.trim() } : {}),
                  })
                  if (!res.ok) {
                    message.error(res.message)
                    return
                  }
                  message.success('已保存')
                  await load()
                } finally {
                  setSaving(false)
                }
              }}
            >
              <Row gutter={16}>
                <Col xs={24} sm={16}>
                  <Form.Item name="smtpHost" label="SMTP 服务器" rules={[{ required: true, message: '请输入主机' }]}>
                    <Input placeholder="例如 smtp.example.com" allowClear size="large" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="smtpPort" label="端口" rules={[{ required: true }]}>
                    <InputNumber min={1} max={65535} style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                label="使用 TLS（SMTPS，常见端口 465）"
                extra="开启后自动将端口设为 465；关闭后设为 587（多为 STARTTLS，若发信失败可再改端口或咨询邮件服务商）。"
              >
                <Form.Item name="smtpSecure" valuePropName="checked" noStyle>
                  <Switch
                    checkedChildren="开"
                    unCheckedChildren="关"
                    onChange={checked => {
                      form.setFieldValue('smtpPort', checked ? 465 : 587)
                    }}
                  />
                </Form.Item>
              </Form.Item>

              <Form.Item
                name="smtpTlsSkipVerify"
                label="跳过 TLS 证书校验"
                valuePropName="checked"
                extra="若出现「unable to verify the first certificate」等自签/内网 CA 问题可开启。公网生产环境不建议开启。"
              >
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>

              <Form.Item name="smtpFrom" label="发件人地址" rules={[{ required: true, message: '请输入发件人' }]}>
                <Input placeholder="noreply@example.com" allowClear size="large" />
              </Form.Item>

              <Form.Item name="smtpUser" label="SMTP 用户名（可选）">
                <Input placeholder="与邮箱或独立账号一致时可填" allowClear />
              </Form.Item>

              <Form.Item
                name="authPass"
                label="SMTP 口令（可选）"
                extra="留空表示不修改已保存的口令。"
              >
                <Input.Password
                  autoComplete="new-password"
                  size="large"
                  placeholder={m.formInitial.hasSavedPassword ? '已保存口令，留空不修改' : '未设置口令'}
                />
              </Form.Item>

              <Form.Item name="clearAuthPass" valuePropName="checked" style={{ marginBottom: 12 }}>
                <Checkbox>清除已保存的 SMTP 口令</Checkbox>
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Space wrap>
                  <Button type="primary" htmlType="submit" loading={saving} size="large">
                    保存配置
                  </Button>
                  <Button onClick={() => void load()} disabled={saving}>
                    放弃修改并重新加载
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          <Card
            title={
              <Space>
                <SendOutlined style={{ color: '#1677ff' }} />
                <span>发送测试邮件</span>
              </Space>
            }
            style={{ marginTop: 16 }}
          >
            <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 16 }}>
              使用<strong>当前已生效</strong>的 SMTP 发一封测试信，用于验证连通性与垃圾箱策略。
            </Typography.Paragraph>
            <Form
              form={testForm}
              layout="vertical"
              onFinish={async fv => {
                const to = String(fv.to ?? '').trim()
                setTestLoading(true)
                try {
                  const res = await postAdminTestMail(to)
                  if (!res.ok) {
                    message.error(res.message)
                    return
                  }
                  message.success('已发送，请查收收件箱或垃圾邮件')
                } finally {
                  setTestLoading(false)
                }
              }}
            >
              <Row gutter={16} align="bottom">
                <Col xs={24} sm={16} md={14}>
                  <Form.Item
                    name="to"
                    label="收件人"
                    rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式无效' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input placeholder="name@company.com" allowClear size="large" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8} md={10}>
                  <Form.Item label=" " colon={false} style={{ marginBottom: 0 }}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={testLoading}
                      disabled={!m.configured}
                      icon={<SendOutlined />}
                      size="large"
                      block
                    >
                      发送测试
                    </Button>
                  </Form.Item>
                </Col>
              </Row>
              {!m.configured ? (
                <Typography.Text type="warning" style={{ display: 'block', marginTop: 12 }}>
                  当前 SMTP 未就绪，请先填写并保存有效配置。
                </Typography.Text>
              ) : null}
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
