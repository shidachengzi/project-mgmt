import { PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Form, InputNumber, Modal, Select, Space, Table, TimePicker, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FormInstance } from 'antd/es/form'
import dayjs from 'dayjs'
import type { Dispatch, SetStateAction } from 'react'
import type { ProjectOverviewReminderRow } from './overviewReminderTypes'

export type ProjectOverviewReminderModalsProps = {
  overviewReminderSettingsOpen: boolean
  setOverviewReminderSettingsOpen: Dispatch<SetStateAction<boolean>>
  overviewReminderEditorOpen: boolean
  setOverviewReminderEditorOpen: Dispatch<SetStateAction<boolean>>
  overviewReminderEditingId: string | null
  setOverviewReminderEditingId: Dispatch<SetStateAction<string | null>>
  overviewReminderForm: FormInstance
  overviewReminderAnchorDatesReady: boolean
  canConfigureOverviewReminders: boolean
  projectOverviewReminders: ProjectOverviewReminderRow[]
  setProjectOverviewReminders: Dispatch<SetStateAction<ProjectOverviewReminderRow[]>>
  overviewReminderTableColumns: ColumnsType<ProjectOverviewReminderRow>
  membersWithEmailCount: number
  flushWorkspaceNow: () => void
}

export function ProjectOverviewReminderModals({
  overviewReminderSettingsOpen,
  setOverviewReminderSettingsOpen,
  overviewReminderEditorOpen,
  setOverviewReminderEditorOpen,
  overviewReminderEditingId,
  setOverviewReminderEditingId,
  overviewReminderForm,
  overviewReminderAnchorDatesReady,
  canConfigureOverviewReminders,
  projectOverviewReminders,
  setProjectOverviewReminders,
  overviewReminderTableColumns,
  membersWithEmailCount,
  flushWorkspaceNow
}: ProjectOverviewReminderModalsProps) {
  return (
    <>
      <Modal
        title="提醒设置"
        open={overviewReminderSettingsOpen}
        onCancel={() => setOverviewReminderSettingsOpen(false)}
        width={860}
        destroyOnHidden={false}
        footer={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
            {!canConfigureOverviewReminders ? (
              <Typography.Text type="secondary" style={{ marginRight: 'auto', fontSize: 13 }}>
                当前账号无「基本设置」权限时仅可查看规则，不可修改。
              </Typography.Text>
            ) : null}
            {canConfigureOverviewReminders ? (
              <Button
                type="primary"
                onClick={() => {
                  flushWorkspaceNow()
                  message.success('提醒规则已保存')
                }}
              >
                保存提醒规则
              </Button>
            ) : null}
            <Button onClick={() => setOverviewReminderSettingsOpen(false)}>关闭</Button>
          </div>
        }
      >
        {!overviewReminderAnchorDatesReady ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="请先设置有效的项目开始与截止时间"
            description="概览提醒以这两个日期为锚点计算提醒时刻；请在项目概览中填写开始时间、截止时间后再配置提醒。"
          />
        ) : null}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <Typography.Text type="secondary" style={{ flex: '1 1 280px', margin: 0 }}>
            【项目概览提醒】到达规则中的计划时刻后，向<strong>全部项目成员</strong>发送站内系统消息；若选择邮件或双通道，还会向已绑定邮箱的成员发邮件（需在「项目管理系统」→ 系统配置 → 邮件中配置 SMTP）。
          </Typography.Text>
          {canConfigureOverviewReminders ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!overviewReminderAnchorDatesReady}
              onClick={() => {
                setOverviewReminderEditingId(null)
                overviewReminderForm.setFieldsValue({
                  anchorTime: 'start',
                  offsetSide: 'before',
                  offsetValue: 1,
                  offsetUnit: 'days',
                  channel: 'system',
                  remindAt: dayjs().hour(9).minute(0).second(0).millisecond(0)
                })
                setOverviewReminderEditorOpen(true)
              }}
            >
              新建提醒
            </Button>
          ) : null}
        </div>
        <Table<ProjectOverviewReminderRow>
          size="small"
          rowKey="id"
          dataSource={projectOverviewReminders}
          pagination={false}
          columns={overviewReminderTableColumns}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无提醒规则" /> }}
        />
      </Modal>
      <Modal
        title={overviewReminderEditingId ? '编辑提醒' : '新建提醒'}
        open={overviewReminderEditorOpen}
        okText="确定"
        cancelText="取消"
        onCancel={() => {
          setOverviewReminderEditorOpen(false)
          setOverviewReminderEditingId(null)
          overviewReminderForm.resetFields()
        }}
        onOk={() => {
          void overviewReminderForm
            .validateFields()
            .then(values => {
              const rt = values.remindAt
              const remindAt =
                rt != null && typeof rt === 'object' && typeof (rt as { format?: (f: string) => string }).format === 'function'
                  ? (rt as { format: (f: string) => string }).format('HH:mm')
                  : '09:00'
              const ch = values.channel === 'email' ? 'email' : values.channel === 'both' ? 'both' : 'system'
              const row: ProjectOverviewReminderRow = {
                id: overviewReminderEditingId ?? `pvr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                anchorTime: values.anchorTime === 'end' ? 'end' : 'start',
                offsetSide: values.offsetSide === 'after' ? 'after' : 'before',
                offsetValue: typeof values.offsetValue === 'number' && Number.isFinite(values.offsetValue) ? Math.max(0, Math.floor(values.offsetValue)) : 0,
                offsetUnit: (['minutes', 'hours', 'days'] as const).includes(values.offsetUnit) ? values.offsetUnit : 'days',
                channel: ch,
                remindAt
              }
              if (overviewReminderEditingId) {
                setProjectOverviewReminders(prev => prev.map(r => (r.id === overviewReminderEditingId ? row : r)))
              } else {
                setProjectOverviewReminders(prev => [...prev, row])
              }
              setOverviewReminderEditorOpen(false)
              setOverviewReminderEditingId(null)
              overviewReminderForm.resetFields()
            })
            .catch(() => {})
        }}
        destroyOnHidden
      >
        <Form form={overviewReminderForm} layout="vertical" initialValues={{}}>
          <Form.Item name="anchorTime" label="时间" rules={[{ required: true, message: '请选择时间' }]}>
            <Select
              options={[
                { value: 'start', label: '开始时间' },
                { value: 'end', label: '结束时间' }
              ]}
            />
          </Form.Item>
          <Form.Item label="节点" required style={{ marginBottom: 0 }}>
            <Space wrap align="center">
              <Form.Item name="offsetSide" noStyle rules={[{ required: true, message: '请选择' }]}>
                <Select
                  style={{ width: 120 }}
                  options={[
                    { value: 'before', label: '开始前' },
                    { value: 'after', label: '开始后' }
                  ]}
                />
              </Form.Item>
              <Form.Item name="offsetValue" noStyle rules={[{ required: true, message: '请输入数值' }]}>
                <InputNumber min={0} precision={0} style={{ width: 88 }} />
              </Form.Item>
              <Form.Item name="offsetUnit" noStyle rules={[{ required: true, message: '请选择单位' }]}>
                <Select
                  style={{ width: 88 }}
                  options={[
                    { value: 'minutes', label: '分钟' },
                    { value: 'hours', label: '小时' },
                    { value: 'days', label: '天' }
                  ]}
                />
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item label="提醒" required style={{ marginBottom: 0 }}>
            <Space wrap align="center">
              <Form.Item name="channel" noStyle rules={[{ required: true, message: '请选择提醒方式' }]}>
                <Select
                  style={{ width: 220 }}
                  options={[
                    { value: 'system', label: '系统消息（站内通知）' },
                    { value: 'email', label: '邮件' },
                    { value: 'both', label: '系统消息 + 邮件' }
                  ]}
                />
              </Form.Item>
              <Form.Item name="remindAt" noStyle rules={[{ required: true, message: '请选择提醒时间' }]}>
                <TimePicker format="HH:mm" minuteStep={5} />
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.channel !== cur.channel}>
            {() => {
              const ch = overviewReminderForm.getFieldValue('channel') as string | undefined
              if (ch !== 'email' && ch !== 'both') return null
              return (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 8 }}
                  message="邮件通道"
                  description={
                    membersWithEmailCount > 0
                      ? `将向当前 ${membersWithEmailCount} 名已绑定邮箱的项目成员发送邮件；未绑定邮箱的成员仍会收到系统消息（若选择「系统消息 + 邮件」）。请确保已在项目管理系统中配置 SMTP。`
                      : '当前项目成员中暂无已绑定邮箱的用户，邮件无法送达；请先完善成员邮箱或改用「仅系统消息」。'
                  }
                />
              )
            }}
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
