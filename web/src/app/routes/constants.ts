export type MyTaskTab = '我负责的' | '我参与的' | '我创建的'
export type ProjectTab = '项目概览' | '目标管理' | '任务管理' | '甘特图' | '更多设置'

export const MY_TASK_TAB_PATHS: Record<MyTaskTab, string> = {
  我负责的: 'responsible',
  我参与的: 'participating',
  我创建的: 'created',
}

export const PATH_TO_MY_TASK_TAB: Record<string, MyTaskTab> = {
  responsible: '我负责的',
  participating: '我参与的',
  created: '我创建的',
}

export const PROJECT_TAB_PATHS: Record<ProjectTab, string> = {
  项目概览: 'overview',
  目标管理: 'targets',
  任务管理: 'tasks',
  甘特图: 'gantt',
  更多设置: 'settings',
}

export const PATH_TO_PROJECT_TAB: Record<string, ProjectTab> = {
  overview: '项目概览',
  targets: '目标管理',
  tasks: '任务管理',
  gantt: '甘特图',
  settings: '更多设置',
}
