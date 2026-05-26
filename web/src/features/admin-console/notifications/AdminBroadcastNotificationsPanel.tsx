import { BellOutlined } from '@ant-design/icons'
import { App, Button, Form, Input, Select, Space, Typography } from 'antd'
import { useState } from 'react'
import { postAdminNotificationBroadcast } from '../../../shared/api/inAppNotificationsApi'

export function AdminBroadcastNotificationsPanel() {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)

  const onFinish = async (v: { type: 'maintenance' | 'security' | 'announcement'; title: string; body: string }) => {
    setLoading(true)
    try {
      const res = await postAdminNotificationBroadcast(v)
      if (!res.ok) {
        message.error(res.message)
        return
      }
      message.success(`已发送全员通知，共 ${res.data.count} 人`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        向当前所有<strong>启用中</strong>用户各写入一条系统通知（维护公告、安全提醒或通用公告）。用户可在头部「消息」-「系统通知」中查看、筛选与标记已读。
      </Typography.Paragraph>
      <Form layout="vertical" onFinish={onFinish} style={{ maxWidth: 520 }} initialValues={{ type: 'announcement' }}>
        <Form.Item label="类型" name="type" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'maintenance', label: '维护公告' },
              { value: 'security', label: '安全提醒' },
              { value: 'announcement', label: '系统公告' },
            ]}
          />
        </Form.Item>
        <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
          <Input maxLength={191} showCount />
        </Form.Item>
        <Form.Item label="正文" name="body" rules={[{ required: true, message: '请输入正文' }]}>
          <Input.TextArea rows={6} maxLength={20000} showCount />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading} icon={<BellOutlined />}>
              发送全员通知
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  )
}
