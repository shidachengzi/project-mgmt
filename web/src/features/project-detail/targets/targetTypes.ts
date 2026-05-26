/** 目标只保留“进度状态”，项目层面单独保留健康度 */
export type TargetStatus = '未开始' | '进行中' | '验收中' | '已完成' | '关闭'

export type TargetRecord = {
  key: string
  title: string
  status: TargetStatus
  type: string
  owner?: string
  createdAt?: string
  updatedAt?: string
  startDate?: string
  endDate?: string
  priority?: '最高' | '较高' | '普通' | '较低' | '最低'
  metricUnit?: string
  metricStart?: string
  metricTarget?: string
  metricCurrent?: string
  acceptanceCriteria?: string
  deliveryNote?: string
  acceptanceFeedback?: string
  participants?: string[]
  meta: string
  risky?: boolean
  description?: string
  createdBy?: string
}

export type TargetEditorTab = '任务信息' | '关联任务' | '附件'

export type TargetSideTab = '评论' | '活动' | '流转' | '状态审批'

export type TargetFilter = 'all' | 'risk' | 'done'

export type TargetEditingField =
  | 'title'
  | 'status'
  | 'owner'
  | 'startDate'
  | 'endDate'
  | 'priority'
  | 'metricUnit'
  | 'metricStart'
  | 'metricTarget'
  | 'metricCurrent'
  | 'acceptanceCriteria'
  | 'deliveryNote'
  | 'acceptanceFeedback'
  | 'description'
