export type ProjectOverviewInfo = {
  title: string
  owner: string
  startDate: string
  endDate: string
  description: string
  progressStatus: '未开始' | '进行中' | '验收中' | '已完成' | '关闭'
  healthStatus: '正常' | '有风险' | '失控'
  statusDescription: string
}

export type ProjectOverviewActivityItem = {
  id: string
  actor: string
  fieldLabel: string
  before: string
  after: string
  createdAt: string
}

export type ProjectOverviewAttachmentItem = {
  id: string
  name: string
  sizeBytes: number
  uploader: string
  createdAt: string
  dataUrl: string
}

export type OverviewTaskStats = {
  total: number
  done: number
  running: number
  notStarted: number
  overdue: number
  todayDue: number
  completionRate: number
  overdueRate: number
}

export type OverviewMemberRecord = {
  key: string
  name: string
  role: string
  dept: string
  action: string
}

export type OverviewEditingField = 'title' | 'owner' | 'startDate' | 'endDate' | 'description' | null
