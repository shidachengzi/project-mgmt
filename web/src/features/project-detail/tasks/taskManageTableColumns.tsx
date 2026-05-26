import { FileTextOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, DatePicker, Select } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { formatDateText, parseDateValue } from '../overview/projectOverviewDisplayUtils'
import { isOverdueActiveTask } from './taskManageListUtils'
import type { TaskManageRecord } from './taskTypes'
import { PriorityWithMarks, TASK_PRIORITY_LEVELS, type TaskPriorityLevel } from '../../../shared/ui/priorityWithMarks'
import { UNIFIED_OWNER_AVATAR_CLASS, UnifiedWorkflowStatusTag, unifiedOwnerAvatarInitials } from '../../../shared/ui/unifiedWorkflowStatusTag'
import { resizableColumnTitle } from '../../../shared/ui/resizableColumnTitle'
import { stageProgressBarModIndex } from './projectTaskAdapter'

export type TaskManageColKey = 'title' | 'status' | 'owner' | 'priority' | 'start' | 'end' | 'attachments' | 'progress'

export const DEFAULT_TASK_MANAGE_COL_WIDTHS: Record<TaskManageColKey, number> = {
  title: 220,
  status: 118,
  owner: 148,
  priority: 132,
  start: 110,
  end: 110,
  attachments: 70,
  progress: 148
}

/** 任务表含 expandable 时 rc-table 会插入展开列，宽度与 Ant Design `tableExpandColumnWidth` 同量级，须计入 scroll.x */
export const TASK_MANAGE_EXPAND_COLUMN_SCROLL_PX = 48

export type TaskManageTableEditingField = 'status' | 'owner' | 'priority' | 'start' | 'end'

export type TaskManageTableEditingCell = {
  key: string
  field: TaskManageTableEditingField
} | null

export type TaskManageRecordForColumns = Pick<
  TaskManageRecord,
  'key' | 'kind' | 'title' | 'status' | 'owner' | 'priority' | 'start' | 'end' | 'progress'
>

export type BuildTaskManageColumnsParams = {
  members: Array<{ name: string }>
  taskAttachmentsByKey: Record<string, unknown[]>
  tableEditingCell: TaskManageTableEditingCell
  setTableEditingCell: (next: TaskManageTableEditingCell) => void
  updateTaskByKey: (taskKey: string, patch: Partial<TaskManageRecordForColumns>) => void
  readonly: boolean
  statusFieldReadonly: boolean
  /** 无「编辑任务」权限时不可改优先级等非状态字段 */
  taskInfoFieldReadonly: boolean
  taskStageOptionTitles: string[]
  columnWidths: Record<TaskManageColKey, number>
  onResizeColumn: (key: TaskManageColKey, w: number) => void
}

const taskTableOwnerAvatarClass = (label: string) =>
  (label || '').trim() === '未分配' || !(label || '').trim()
    ? `${UNIFIED_OWNER_AVATAR_CLASS} wt-reports-detail__owner-avatar--empty`
    : UNIFIED_OWNER_AVATAR_CLASS

const taskPriorityPillClass = (p: TaskManageRecordForColumns['priority']) => {
  const m: Record<TaskManageRecordForColumns['priority'], string> = {
    最高: 'wt-task-page__pill wt-task-page__pill--priority-highest',
    较高: 'wt-task-page__pill wt-task-page__pill--priority-high',
    普通: 'wt-task-page__pill wt-task-page__pill--priority-normal',
    较低: 'wt-task-page__pill wt-task-page__pill--priority-low',
    最低: 'wt-task-page__pill wt-task-page__pill--priority-lowest'
  }
  return m[p] ?? m['普通']
}

export function buildTaskManageColumns({
  members,
  taskAttachmentsByKey,
  tableEditingCell,
  setTableEditingCell,
  updateTaskByKey,
  readonly,
  statusFieldReadonly,
  taskInfoFieldReadonly,
  taskStageOptionTitles,
  columnWidths,
  onResizeColumn
}: BuildTaskManageColumnsParams): ColumnsType<TaskManageRecordForColumns> {
  const th = (label: string, key: TaskManageColKey, minWidth?: number) =>
    resizableColumnTitle(label, key, columnWidths[key], w => onResizeColumn(key, w), { minWidth: minWidth ?? 64 })

  return [
    {
      title: th('标题', 'title', 100),
      dataIndex: 'title',
      key: 'title',
      width: columnWidths.title,
      render: (value: string, record) => {
        if (record.kind === 'stage') return <span className="wt-task-page__stage-title">{value}</span>
        return (
          <span className="wt-task-page__task-title">
            <span className="wt-task-page__task-icon">
              <FileTextOutlined />
            </span>
            {value}
          </span>
        )
      }
    },
    {
      title: th('状态', 'status'),
      dataIndex: 'status',
      key: 'status',
      width: columnWidths.status,
      render: (value: TaskManageRecordForColumns['status'], record) => {
        if (record.kind === 'stage') return null
        if (tableEditingCell?.key === record.key && tableEditingCell.field === 'status') {
          return (
            <Select
              autoFocus
              size="small"
              open
              value={record.status}
              onChange={next => {
                updateTaskByKey(record.key, { status: next as TaskManageRecordForColumns['status'] })
                setTableEditingCell(null)
              }}
              onBlur={() => setTableEditingCell(null)}
              onClick={e => e.stopPropagation()}
              options={[
                { value: '未开始', label: '未开始' },
                { value: '进行中', label: '进行中' },
                { value: '搁置中', label: '搁置中' },
                { value: '已完成', label: '已完成' },
                { value: '关闭', label: '关闭' }
              ]}
              style={{ width: 104 }}
            />
          )
        }
        return (
          <span
            className="wt-task-page__pill--clickable"
            style={{ cursor: statusFieldReadonly ? 'default' : 'pointer' }}
            onClick={e => {
              if (statusFieldReadonly) return
              e.stopPropagation()
              setTableEditingCell({ key: record.key, field: 'status' })
            }}
            role="button"
            tabIndex={0}
          >
            <UnifiedWorkflowStatusTag status={value} />
          </span>
        )
      }
    },
    {
      title: th('负责人', 'owner'),
      dataIndex: 'owner',
      key: 'owner',
      width: columnWidths.owner,
      render: (value: string | undefined, record) => {
        if (record.kind === 'stage') return null
        if (tableEditingCell?.key === record.key && tableEditingCell.field === 'owner') {
          return (
            <Select
              autoFocus
              size="small"
              value={record.owner}
              onChange={next => {
                updateTaskByKey(record.key, { owner: next })
                setTableEditingCell(null)
              }}
              allowClear
              onClear={() => {
                updateTaskByKey(record.key, { owner: undefined })
                setTableEditingCell(null)
              }}
              onBlur={() => setTableEditingCell(null)}
              onClick={e => e.stopPropagation()}
              options={members.map(m => ({ value: m.name, label: m.name }))}
              style={{ minWidth: 112 }}
            />
          )
        }
        const label = (value || '').trim() || '未分配'
        return (
          <span
            className="wt-task-page__owner-cell"
            style={{ cursor: statusFieldReadonly ? 'default' : 'pointer' }}
            onClick={e => {
              if (statusFieldReadonly) return
              e.stopPropagation()
              setTableEditingCell({ key: record.key, field: 'owner' })
            }}
          >
            <Avatar size={22} className={taskTableOwnerAvatarClass(label)} icon={label === '未分配' ? <UserOutlined /> : undefined}>
              {label === '未分配' ? undefined : unifiedOwnerAvatarInitials(label)}
            </Avatar>
            <span className="wt-task-page__owner-name">{value || '负责人'}</span>
          </span>
        )
      }
    },
    {
      title: th('优先级', 'priority'),
      dataIndex: 'priority',
      key: 'priority',
      width: columnWidths.priority,
      render: (value: TaskManageRecordForColumns['priority'], record) => {
        if (record.kind === 'stage') return null
        const priorityReadonly = readonly || taskInfoFieldReadonly
        if (tableEditingCell?.key === record.key && tableEditingCell.field === 'priority' && !priorityReadonly) {
          return (
            <Select
              autoFocus
              size="small"
              open
              value={record.priority}
              onChange={next => {
                updateTaskByKey(record.key, { priority: next as TaskManageRecordForColumns['priority'] })
                setTableEditingCell(null)
              }}
              onBlur={() => setTableEditingCell(null)}
              onClick={e => e.stopPropagation()}
              options={TASK_PRIORITY_LEVELS.map((priority: TaskPriorityLevel) => ({
                value: priority,
                label: <PriorityWithMarks priority={priority} />
              }))}
              style={{ width: 152 }}
            />
          )
        }
        return (
          <span
            className={`${taskPriorityPillClass(value)} wt-task-page__pill--clickable`}
            style={{ cursor: priorityReadonly ? 'default' : 'pointer' }}
            onClick={e => {
              e.stopPropagation()
              if (priorityReadonly) return
              setTableEditingCell({ key: record.key, field: 'priority' })
            }}
            role="button"
            tabIndex={priorityReadonly ? -1 : 0}
          >
            <PriorityWithMarks priority={value} />
          </span>
        )
      }
    },
    {
      title: th('开始时间', 'start'),
      dataIndex: 'start',
      key: 'start',
      width: columnWidths.start,
      render: (value: string, record) => {
        if (record.kind === 'stage') return null
        if (tableEditingCell?.key === record.key && tableEditingCell.field === 'start') {
          return (
            <DatePicker
              autoFocus
              size="small"
              open
              value={parseDateValue(record.start)}
              format="YYYY年M月D日"
              onChange={d => {
                updateTaskByKey(record.key, { start: d ? d.format('YYYY-MM-DD') : '' })
                setTableEditingCell(null)
              }}
              onOpenChange={open => {
                if (!open) setTableEditingCell(null)
              }}
              onClick={e => e.stopPropagation()}
            />
          )
        }
        return (
          <span
            style={{ cursor: statusFieldReadonly ? 'default' : 'pointer' }}
            onClick={e => {
              if (statusFieldReadonly) return
              e.stopPropagation()
              setTableEditingCell({ key: record.key, field: 'start' })
            }}
          >
            {formatDateText(value) || '开始时间'}
          </span>
        )
      }
    },
    {
      title: th('截止时间', 'end'),
      dataIndex: 'end',
      key: 'end',
      width: columnWidths.end,
      render: (value: string, record) => {
        if (record.kind === 'stage') return null
        if (tableEditingCell?.key === record.key && tableEditingCell.field === 'end') {
          return (
            <DatePicker
              autoFocus
              size="small"
              open
              value={parseDateValue(record.end)}
              format="YYYY年M月D日"
              onChange={d => {
                updateTaskByKey(record.key, { end: d ? d.format('YYYY-MM-DD') : '' })
                setTableEditingCell(null)
              }}
              onOpenChange={open => {
                if (!open) setTableEditingCell(null)
              }}
              onClick={e => e.stopPropagation()}
            />
          )
        }
        return (
          <span
            className={isOverdueActiveTask(record) ? 'wt-task-page__deadline--danger' : undefined}
            style={{ cursor: statusFieldReadonly ? 'default' : 'pointer' }}
            onClick={e => {
              if (statusFieldReadonly) return
              e.stopPropagation()
              setTableEditingCell({ key: record.key, field: 'end' })
            }}
          >
            {formatDateText(value) || '截止时间'}
          </span>
        )
      }
    },
    {
      title: th('附件', 'attachments', 48),
      dataIndex: 'attachments',
      key: 'attachments',
      width: columnWidths.attachments,
      render: (_: number, record) => (record.kind === 'stage' ? null : (taskAttachmentsByKey[record.key]?.length ?? 0))
    },
    {
      title: th('阶段进度', 'progress', 100),
      dataIndex: 'progress',
      key: 'progress',
      width: columnWidths.progress,
      align: 'right',
      render: (value: number, record) =>
        record.kind === 'stage' ? (
          <div className="wt-task-page__progress wt-task-page__progress--stage-cell">
            <div className="wt-task-page__progress-bar">
              <div
                className={`wt-task-page__progress-fill wt-task-page__progress-fill--stage-${stageProgressBarModIndex(record.title, taskStageOptionTitles)}`}
                style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
              />
            </div>
            <span className="wt-task-page__progress-text">{value}%</span>
          </div>
        ) : null
    }
  ]
}
