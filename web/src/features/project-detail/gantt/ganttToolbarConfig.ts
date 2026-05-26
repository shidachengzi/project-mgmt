/** 甘特图工具栏：排序 / 高级筛选（条件与左侧行字段一致） */

export const GANTT_FILTER_OWNER_UNASSIGNED = '__UNASSIGNED__'

export type GanttTableSortKey =
  | 'custom'
  | 'title'
  | 'owner'
  | 'createdBy'
  | 'status'
  | 'priority'
  | 'start'
  | 'end'
  | 'createdAt'

export const GANTT_SORT_DROPDOWN_MENU_ITEMS = [
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
      { key: 'createdAt', label: '创建时间' },
    ],
  },
]

export type GanttTableFilterField = 'status' | 'priority' | 'owner' | 'createdBy' | 'stage' | 'title' | 'start' | 'end' | 'createdAt'

export type GanttTableFilterOp = 'eq' | 'neq' | 'contains' | 'not_contains' | 'before' | 'after' | 'date_eq'

export type GanttTableFilterCondition = {
  id: string
  field: GanttTableFilterField
  op: GanttTableFilterOp
  value: string
}

export const GANTT_FILTER_FIELD_OPTIONS: { value: GanttTableFilterField; label: string }[] = [
  { value: 'status', label: '状态' },
  { value: 'priority', label: '优先级' },
  { value: 'owner', label: '负责人' },
  { value: 'createdBy', label: '创建人' },
  { value: 'stage', label: '项目阶段' },
  { value: 'title', label: '标题' },
  { value: 'start', label: '开始时间' },
  { value: 'end', label: '截止时间' },
  { value: 'createdAt', label: '创建时间' },
]

export function defaultOpForGanttFilterField(field: GanttTableFilterField): GanttTableFilterOp {
  if (field === 'title') return 'contains'
  if (field === 'start' || field === 'end' || field === 'createdAt') return 'date_eq'
  return 'eq'
}

export function opsForGanttFilterField(field: GanttTableFilterField): { value: GanttTableFilterOp; label: string }[] {
  if (field === 'title') {
    return [
      { value: 'contains', label: '包含' },
      { value: 'not_contains', label: '不包含' },
    ]
  }
  if (field === 'start' || field === 'end' || field === 'createdAt') {
    return [
      { value: 'before', label: '早于' },
      { value: 'after', label: '晚于' },
      { value: 'date_eq', label: '等于' },
    ]
  }
  return [
    { value: 'eq', label: '等于' },
    { value: 'neq', label: '不等于' },
  ]
}

export function ganttFilterRowHasValue(c: GanttTableFilterCondition): boolean {
  if (c.field === 'owner' && c.value === GANTT_FILTER_OWNER_UNASSIGNED) return true
  if (c.field === 'createdBy' && c.value === '未指定') return true
  return c.value.trim().length > 0
}

export function newGanttTableFilterId(): string {
  return `gf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
