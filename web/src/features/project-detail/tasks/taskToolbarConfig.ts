/** 任务管理表格工具栏：排序 / 分组（与 ProjectDetailPage 中 taskRows 管线一致） */

export type TaskTableSortKey =
  | 'custom'
  | 'title'
  | 'owner'
  | 'createdBy'
  | 'status'
  | 'priority'
  | 'start'
  | 'end'
  | 'completedAt'
  | 'createdAt'
  | 'updatedAt'

export type TaskGroupMode = 'none' | 'stage' | 'bizType' | 'status' | 'priority' | 'owner' | 'createdBy'

export const TASK_SORT_DROPDOWN_MENU_ITEMS = [
  {
    type: 'group' as const,
    label: '排序',
    children: [
      { key: 'custom', label: '自定义' },
      { key: 'title', label: '标题' },
      { key: 'owner', label: '负责人' },
      { key: 'createdBy', label: '创建人' },
      { key: 'status', label: '状态' },
      { key: 'priority', label: '优先级' },
      { key: 'start', label: '开始时间' },
      { key: 'end', label: '截止时间' },
      { key: 'completedAt', label: '完成时间' },
      { key: 'createdAt', label: '创建时间' },
      { key: 'updatedAt', label: '更新时间' }
    ]
  }
]

export const TASK_GROUP_DROPDOWN_MENU_ITEMS = [
  {
    type: 'group' as const,
    label: '分组',
    children: [
      { key: 'none', label: '不分组' },
      { key: 'stage', label: '项目阶段' },
      { key: 'bizType', label: '任务类型' },
      { key: 'status', label: '状态' },
      { key: 'priority', label: '优先级' },
      { key: 'owner', label: '负责人' },
      { key: 'createdBy', label: '创建人' }
    ]
  }
]

/** 任务管理表格：工具栏高级筛选 */
export type TaskManageTableFilterField =
  | 'status'
  | 'bizType'
  | 'owner'
  | 'createdBy'
  | 'priority'
  | 'stage'
  | 'title'
  | 'start'
  | 'end'
  | 'createdAt'
  | 'updatedAt'
  | 'completedAt'

export type TaskManageTableFilterOp = 'eq' | 'neq' | 'contains' | 'not_contains' | 'before' | 'after' | 'date_eq'

export type TaskManageTableFilterCondition = {
  id: string
  field: TaskManageTableFilterField
  op: TaskManageTableFilterOp
  value: string
}

export const TASK_MANAGE_TABLE_FILTER_FIELD_OPTIONS: { value: TaskManageTableFilterField; label: string }[] = [
  { value: 'status', label: '状态' },
  { value: 'bizType', label: '任务类型' },
  { value: 'owner', label: '负责人' },
  { value: 'createdBy', label: '创建人' },
  { value: 'priority', label: '优先级' },
  { value: 'stage', label: '项目阶段' },
  { value: 'title', label: '标题' },
  { value: 'start', label: '开始时间' },
  { value: 'end', label: '截止时间' },
  { value: 'createdAt', label: '创建时间' },
  { value: 'updatedAt', label: '更新时间' },
  { value: 'completedAt', label: '完成时间' }
]

export function defaultOpForTaskManageTableFilterField(field: TaskManageTableFilterField): TaskManageTableFilterOp {
  if (field === 'title') return 'contains'
  if (field === 'start' || field === 'end' || field === 'createdAt' || field === 'updatedAt' || field === 'completedAt') return 'date_eq'
  return 'eq'
}

export function opsForTaskManageTableFilterField(field: TaskManageTableFilterField): { value: TaskManageTableFilterOp; label: string }[] {
  if (field === 'title') {
    return [
      { value: 'contains', label: '包含' },
      { value: 'not_contains', label: '不包含' }
    ]
  }
  if (field === 'start' || field === 'end' || field === 'createdAt' || field === 'updatedAt' || field === 'completedAt') {
    return [
      { value: 'before', label: '早于' },
      { value: 'after', label: '晚于' },
      { value: 'date_eq', label: '等于' }
    ]
  }
  return [
    { value: 'eq', label: '等于' },
    { value: 'neq', label: '不等于' }
  ]
}
