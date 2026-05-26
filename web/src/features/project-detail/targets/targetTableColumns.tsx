import { FolderFilled } from '@ant-design/icons'
import { Avatar, Space } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PriorityWithMarks } from '../../../shared/ui/priorityWithMarks'
import { UNIFIED_OWNER_AVATAR_CLASS, UnifiedWorkflowStatusTag, unifiedOwnerAvatarInitials } from '../../../shared/ui/unifiedWorkflowStatusTag'
import { resizableColumnTitle } from '../../../shared/ui/resizableColumnTitle'
import { buildTargetOtherInfoParts, resolveTargetPriority } from './targetMeta'
import { isTargetGroupTableRow, type TargetTableRow } from './targetTableGrouping'
import type { TargetRecord } from './targetTypes'

export type TargetColKey = 'title' | 'status' | 'type' | 'owner' | 'meta'

export const DEFAULT_TARGET_COL_WIDTHS: Record<TargetColKey, number> = {
  title: 320,
  status: 116,
  type: 110,
  owner: 120,
  meta: 220
}

export const TARGET_TABLE_EXPAND_COLUMN_SCROLL_PX = 48

export function buildTargetTableColumns(widths: Record<TargetColKey, number>, onResize: (key: TargetColKey, w: number) => void): ColumnsType<TargetTableRow> {
  const th = (label: string, key: TargetColKey, minWidth?: number) => resizableColumnTitle(label, key, widths[key], w => onResize(key, w), { minWidth: minWidth ?? 72 })

  return [
    {
      title: th('标题', 'title', 120),
      dataIndex: 'title',
      key: 'title',
      width: widths.title,
      render: (value: string, record) => {
        if (isTargetGroupTableRow(record)) return <span className="wt-target-page__group-title">{record.title}</span>
        return (
          <span className="wt-target-page__row-title">
            <span className="wt-target-page__row-icon">
              <FolderFilled />
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
      width: widths.status,
      render: (value: TargetRecord['status'], record) => {
        if (isTargetGroupTableRow(record)) return null
        return <UnifiedWorkflowStatusTag status={value} />
      }
    },
    {
      title: th('任务类型', 'type'),
      dataIndex: 'type',
      key: 'type',
      width: widths.type,
      render: (value: string, record) => {
        if (isTargetGroupTableRow(record)) return null
        return (
          <span className="wt-target-type">
            <FolderFilled />
            {value}
          </span>
        )
      }
    },
    {
      title: th('负责人', 'owner'),
      dataIndex: 'owner',
      key: 'owner',
      width: widths.owner,
      render: (value: string | undefined, record) => {
        if (isTargetGroupTableRow(record)) return null
        return value ? (
          <Space size={6}>
            <Avatar size={18} className={UNIFIED_OWNER_AVATAR_CLASS}>
              {unifiedOwnerAvatarInitials(value)}
            </Avatar>
            <span>{value}</span>
          </Space>
        ) : (
          '-'
        )
      }
    },
    {
      title: th('其他信息', 'meta', 140),
      dataIndex: 'meta',
      key: 'meta',
      width: widths.meta,
      render: (_value: string, record) => {
        if (isTargetGroupTableRow(record)) return null
        const { timePart } = buildTargetOtherInfoParts(record)
        const p = resolveTargetPriority(record)
        return (
          <Space size={6} wrap>
            <span className="wt-meta-chip">
              优先级: <PriorityWithMarks priority={p} />
            </span>
            <span className="wt-meta-chip">{timePart}</span>
          </Space>
        )
      }
    }
  ]
}
