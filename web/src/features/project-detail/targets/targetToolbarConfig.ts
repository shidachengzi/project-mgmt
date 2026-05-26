/** 目标管理表格工具栏：排序 / 分组（与 ProjectDetailPage 中 targetDisplayRows 管线一致） */

export type TargetTableSortKey =
  | 'custom'
  | 'completedAt'
  | 'createdAt'
  | 'endDate'
  | 'startDate'
  | 'updatedAt'
  | 'status'
  | 'priority'
  | 'title'
  | 'owner'
  | 'createdBy'

export type TargetGroupMode = 'none' | 'custom' | 'type' | 'status' | 'priority' | 'owner' | 'createdBy'

export const TARGET_SORT_DROPDOWN_MENU_ITEMS = [
  {
    type: 'group' as const,
    label: '排序',
    children: [
      { key: 'custom', label: '自定义' },
      { key: 'completedAt', label: '完成时间' },
      { key: 'createdAt', label: '创建时间' },
      { key: 'endDate', label: '截止时间' },
      { key: 'startDate', label: '开始时间' },
      { key: 'updatedAt', label: '更新时间' },
      { key: 'status', label: '状态' },
      { key: 'priority', label: '优先级' },
      { key: 'title', label: '标题' },
      { key: 'owner', label: '负责人' },
      { key: 'createdBy', label: '创建人' }
    ]
  }
]

export const TARGET_GROUP_DROPDOWN_MENU_ITEMS = [
  {
    type: 'group' as const,
    label: '分组',
    children: [
      { key: 'none', label: '不分组' },
      { key: 'custom', label: '自定义分组' },
      { key: 'type', label: '任务类型' },
      { key: 'status', label: '状态' },
      { key: 'priority', label: '优先级' },
      { key: 'owner', label: '负责人' },
      { key: 'createdBy', label: '创建人' }
    ]
  }
]
