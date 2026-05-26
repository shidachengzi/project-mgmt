import { Button, Space, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FormInstance } from 'antd/es/form'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import type { ProjectOverviewReminderRow } from './overviewReminderTypes'
import { PROJECT_OVERVIEW_REMINDER_OFFSET_UNIT_LABELS } from './overviewReminderConstants'

export function useOverviewReminderTableColumns(
  canConfigureOverviewReminders: boolean,
  overviewReminderForm: FormInstance,
  onEditReminder: (row: ProjectOverviewReminderRow) => void,
  onDeleteReminder: (id: string) => void
): ColumnsType<ProjectOverviewReminderRow> {
  return useMemo(
    () => [
      {
        title: '时间',
        dataIndex: 'anchorTime',
        key: 'anchorTime',
        width: 120,
        render: (v: ProjectOverviewReminderRow['anchorTime']) => (v === 'end' ? '结束时间' : '开始时间')
      },
      {
        title: '提醒节点',
        key: 'node',
        render: (_, row) => {
          const anchorEnd = row.anchorTime === 'end'
          const side = row.offsetSide === 'before' ? (anchorEnd ? '结束前' : '开始前') : anchorEnd ? '结束后' : '开始后'
          return `${side} ${row.offsetValue} ${PROJECT_OVERVIEW_REMINDER_OFFSET_UNIT_LABELS[row.offsetUnit]}`
        }
      },
      {
        title: '提醒方式',
        key: 'channel',
        render: (_, row) => {
          const ch = row.channel === 'email' ? '邮件' : row.channel === 'both' ? '系统消息 + 邮件' : '系统消息'
          return `${ch} · ${row.remindAt}`
        }
      },
      {
        title: '操作',
        key: 'op',
        width: canConfigureOverviewReminders ? 132 : 48,
        render: (_, row) =>
          canConfigureOverviewReminders ? (
            <Space size={0} wrap>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  overviewReminderForm.setFieldsValue({
                    anchorTime: row.anchorTime,
                    offsetSide: row.offsetSide,
                    offsetValue: row.offsetValue,
                    offsetUnit: row.offsetUnit,
                    channel: row.channel,
                    remindAt: dayjs(row.remindAt, 'HH:mm')
                  })
                  onEditReminder(row)
                }}
              >
                编辑
              </Button>
              <Button type="link" danger size="small" onClick={() => onDeleteReminder(row.id)}>
                删除
              </Button>
            </Space>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          )
      }
    ],
    [canConfigureOverviewReminders, onDeleteReminder, onEditReminder, overviewReminderForm]
  )
}
