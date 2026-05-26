import { App, Descriptions, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { fetchAdminSystemConfig, type AdminSystemConfigDTO } from '../../../shared/api/adminSystemConfigApi'
import { isBackendAuthEnabled } from '../../../shared/api/backendClient'

export function AdminSystemServicePanel() {
  const { message } = App.useApp()
  const [data, setData] = useState<AdminSystemConfigDTO | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isBackendAuthEnabled()) {
      setLoading(false)
      return
    }
    let cancel = false
    void (async () => {
      const res = await fetchAdminSystemConfig()
      if (cancel) return
      if (!res.ok) {
        message.error(res.message)
        setData(null)
      } else {
        setData(res.data)
      }
      setLoading(false)
    })()
    return () => {
      cancel = true
    }
  }, [message])

  if (!isBackendAuthEnabled()) {
    return <Typography.Text type="secondary">当前为本地模式，无服务端运行参数可展示。</Typography.Text>
  }

  if (loading) return <Typography.Text type="secondary">加载中…</Typography.Text>
  if (!data) return null

  const s = data.service
  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        以下为当前 API 进程读取的环境变量快照（修改 .env 后需重启服务）。提醒扫描由进程内 **node-cron** 或 IM 进程调度；亦可用手动 HTTP 触发。
      </Typography.Paragraph>
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="NODE_ENV">{s.nodeEnv}</Descriptions.Item>
        <Descriptions.Item label="DEADLINE_REMINDER_LEAD_MINUTES">{s.deadlineReminderLeadMinutes}</Descriptions.Item>
        <Descriptions.Item label="DEADLINE_REMINDER_INTERVAL_MS">{s.deadlineReminderIntervalMs}</Descriptions.Item>
        <Descriptions.Item label="DEADLINE_REMINDER_IN_IM（IM 进程内定时扫描）">{s.deadlineReminderInIm ? '是' : '否'}</Descriptions.Item>
        <Descriptions.Item label="DEADLINE_REMINDER_IN_NEXT（Next instrumentation）">{s.deadlineReminderInNext ? '是' : '否'}</Descriptions.Item>
        <Descriptions.Item label="INTERNAL_CRON_SECRET 已配置">{s.internalCronSecretSet ? '是' : '否'}</Descriptions.Item>
      </Descriptions>
      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        可选：手动触发一次扫描（与定时任务逻辑相同）可调用 <Typography.Text code>POST /api/internal/deadline-reminders</Typography.Text>，请求头{' '}
        <Typography.Text code>x-pm-cron-secret</Typography.Text> 与 <Typography.Text code>INTERNAL_CRON_SECRET</Typography.Text> 一致。
      </Typography.Paragraph>
    </div>
  )
}
