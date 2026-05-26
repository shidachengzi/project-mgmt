export type TaskManageRecord = {
  key: string
  kind: 'stage' | 'task' | 'subtask'
  seq?: number
  title: string
  status: '未开始' | '进行中' | '搁置中' | '已完成' | '关闭'
  owner?: string
  ownerUserId?: string | null
  stage?: string
  priority: '最高' | '较高' | '普通' | '较低' | '最低'
  start: string
  end: string
  /** 与 TaskManageEditorModal / projectTaskAdapter 一致，用于「任务」类详情展示 */
  bizLabel?: string
  description?: string
  attachments: number
  progress: number
  createdAt?: string
  updatedAt?: string
  /** 展示用创建人姓名 */
  createdBy?: string
  children?: TaskManageRecord[]
}

export type TaskFilter = 'all' | 'unassigned' | 'mine' | 'overdue'

export type TaskEditorTab = '任务信息' | '子任务' | '附件'

/** 任务详情弹窗子任务列表行 */
export type TaskEditorSubtask = {
  key: string
  id: number
  title: string
  end: string
  status: TaskManageRecord['status']
  owner: string
}

export type CreateSubtaskOptions = {
  owner?: string
  start?: string
  end?: string
  stage?: string
  priority?: TaskManageRecord['priority']
  participants?: string[]
  description?: string
}
