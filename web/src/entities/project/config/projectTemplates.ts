export type ProjectTemplateId = 'project-management' | 'rd-project-management'

/** 任务管理默认四阶段（列表与表格按此顺序展示） */
export const DEFAULT_TASK_STAGE_TITLES: string[] = ['执行阶段', '验收阶段', '结项阶段', '启动阶段']

export type ProjectTemplateConfig = {
  id: ProjectTemplateId
  name: string
  targetTypeLabel: string
  taskTypeLabel: string
  targetTabLabel: string
  taskTabLabel: string
  taskStageTitles: string[]
}

export const projectTemplateConfigs: ProjectTemplateConfig[] = [
  {
    id: 'project-management',
    name: '通用项目管理',
    targetTypeLabel: '项目目标',
    taskTypeLabel: '项目任务',
    targetTabLabel: '目标管理',
    taskTabLabel: '任务管理',
    taskStageTitles: [...DEFAULT_TASK_STAGE_TITLES]
  }
]

export const defaultProjectTemplateId: ProjectTemplateId = 'project-management'

export const getProjectTemplateConfig = (templateId?: ProjectTemplateId): ProjectTemplateConfig => {
  return projectTemplateConfigs.find(item => item.id === templateId) ?? projectTemplateConfigs.find(item => item.id === defaultProjectTemplateId) ?? projectTemplateConfigs[0]
}
