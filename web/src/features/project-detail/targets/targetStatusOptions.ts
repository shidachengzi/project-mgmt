import type { TargetStatus } from './targetTypes'

export const TARGET_STATUS_OPTIONS: { value: TargetStatus; label: string }[] = [
  { value: '未开始', label: '未开始' },
  { value: '进行中', label: '进行中' },
  { value: '验收中', label: '验收中' },
  { value: '已完成', label: '已完成' },
  { value: '关闭', label: '关闭' }
]
